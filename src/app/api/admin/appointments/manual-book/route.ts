import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizeIndonesianPhone } from '@/lib/utils/phone';
import { sendWhatsAppViaFonnte } from '@/lib/wa/fonnte';
import {
  calculateWAFollowUpTriggers,
  formatWITADateTime,
  formatWITATime,
  getWITAParts,
  createWITAISOString,
} from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

const ManualBookSchema = z.object({
  patient_id: z.string().uuid().optional().nullable(),
  full_name: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  whatsapp: z.string().min(8, 'Nomor WhatsApp tidak valid'),
  age: z.coerce.number().min(1, 'Usia minimal 1 tahun').max(120, 'Usia maksimal 120 tahun').optional().nullable(),
  address: z.string().optional().nullable(),
  complaint_summary: z.string().optional().nullable(),
  package_type: z.enum(['SINGLE_150K', 'PACKAGE_3X_400K']),
  slot_start: z.string().min(10, 'Waktu slot tidak valid'),
  send_wa_notification: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = ManualBookSchema.parse(json);

    // 1. Normalize Indonesian Phone Number
    const phoneResult = normalizeIndonesianPhone(payload.whatsapp);
    if (!phoneResult.isValid) {
      return NextResponse.json(
        {
          error: 'Nomor WhatsApp tidak valid. Gunakan format nomor handphone Indonesia (contoh: 0811443327).',
          code: 'INVALID_PHONE_NUMBER',
        },
        { status: 400 }
      );
    }

    const normalizedPhone = phoneResult.normalized;
    const pinLast4 = phoneResult.pin_last4;

    // 2. Validate & calculate slot_end (+60 minutes in WITA)
    const slotStartDate = new Date(payload.slot_start);
    if (isNaN(slotStartDate.getTime())) {
      return NextResponse.json(
        { error: 'Format tanggal/jam slot tidak valid.', code: 'INVALID_DATE' },
        { status: 400 }
      );
    }

    const slotEndDate = new Date(slotStartDate.getTime() + 60 * 60 * 1000);
    const slotEndParts = getWITAParts(slotEndDate);
    const slotEndIso = createWITAISOString(
      slotEndParts.year,
      slotEndParts.month,
      slotEndParts.day,
      slotEndParts.hour,
      slotEndParts.minute,
      0
    );

    const admin = createAdminClient();

    // 3. Find or Create/Update Patient
    let patientId: string;
    let magicToken: string;

    if (payload.patient_id) {
      // Direct lookup by ID
      const { data: existingById, error: fetchErr } = await admin
        .from('patients')
        .select('id, magic_token, whatsapp')
        .eq('id', payload.patient_id)
        .maybeSingle();

      if (fetchErr || !existingById) {
        return NextResponse.json(
          { error: 'Data pasien yang dipilih tidak ditemukan.', code: 'PATIENT_NOT_FOUND' },
          { status: 404 }
        );
      }

      patientId = existingById.id;
      magicToken = existingById.magic_token;

      // Update patient profile if changed
      await admin
        .from('patients')
        .update({
          full_name: payload.full_name,
          age: payload.age ?? null,
          address: payload.address ?? null,
          pin_last4: pinLast4,
        })
        .eq('id', patientId);
    } else {
      // Lookup by WhatsApp number
      const { data: existingByPhone } = await admin
        .from('patients')
        .select('id, magic_token')
        .eq('whatsapp', normalizedPhone)
        .maybeSingle();

      if (existingByPhone) {
        patientId = existingByPhone.id;
        magicToken = existingByPhone.magic_token;

        await admin
          .from('patients')
          .update({
            full_name: payload.full_name,
            age: payload.age ?? null,
            address: payload.address ?? null,
            pin_last4: pinLast4,
          })
          .eq('id', patientId);
      } else {
        // Create new patient
        magicToken = `rp-${crypto.randomBytes(8).toString('hex')}`;
        const { data: newPatient, error: createErr } = await admin
          .from('patients')
          .insert({
            full_name: payload.full_name,
            age: payload.age ?? null,
            whatsapp: normalizedPhone,
            address: payload.address ?? null,
            magic_token: magicToken,
            pin_last4: pinLast4,
          })
          .select('id')
          .single();

        if (createErr || !newPatient) {
          console.error('[Admin Manual Book] Failed to create patient:', createErr);
          return NextResponse.json(
            { error: 'Gagal membuat data pasien baru.' },
            { status: 500 }
          );
        }

        patientId = newPatient.id;
      }
    }

    // 4. Insert Appointment with status 'CONFIRMED'
    const { data: appointment, error: apptError } = await admin
      .from('appointments')
      .insert({
        patient_id: patientId,
        lead_id: null,
        slot_start: payload.slot_start,
        slot_end: slotEndIso,
        package_type: payload.package_type,
        status: 'CONFIRMED',
        amount_paid_idr: 0,
        notes: payload.complaint_summary || null,
        utm_source: 'Manual WA',
        utm_campaign: 'admin_panel',
      })
      .select('id, patient_id, slot_start, slot_end, package_type, status, notes, created_at')
      .single();

    if (apptError) {
      if (
        apptError.code === '23505' ||
        apptError.message?.includes('idx_unique_active_slot') ||
        apptError.message?.toLowerCase().includes('unique')
      ) {
        return NextResponse.json(
          {
            error: 'Slot sesi ini sudah terisi pasien lain. Pilih tanggal atau sesi lain.',
            code: 'SLOT_ALREADY_BOOKED',
          },
          { status: 409 }
        );
      }

      console.error('[Admin Manual Book] Insert appointment error:', apptError);
      return NextResponse.json(
        { error: 'Gagal menyimpan reservasi jadwal.', details: apptError.message },
        { status: 500 }
      );
    }

    const appointmentId = appointment.id;
    const nowMs = Date.now();
    const formattedDateTime = formatWITADateTime(slotStartDate);
    const formattedTime = formatWITATime(slotStartDate);

    // 5. Send/Queue WhatsApp Notifications if requested
    let waQueued = false;
    let waSentInstant = false;

    if (payload.send_wa_notification) {
      const triggers = calculateWAFollowUpTriggers(payload.slot_start);
      const intakeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/intake/${magicToken}`;
      const gmapsUrl =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL ||
        process.env.NEXT_PUBLIC_GMAPS_REVIEW_URL ||
        'https://maps.google.com/?q=Ruang+Pulih+Makassar';

      const bookingMessageBody = `Halo *${payload.full_name}*, jadwal terapi Anda di *Ruang Pulih Makassar* telah terkonfirmasi oleh praktisi:

📅 *Jadwal Terapi:* ${formattedDateTime}
📍 *Alamat Klinik:* Jl. Batua Raya 10B No. 9, Makassar
🗺️ *Google Maps:* ${gmapsUrl}
🏷️ *Pilihan Paket:* ${payload.package_type === 'SINGLE_150K' ? 'Sesi Awal 60 Menit (Rp 150.000)' : 'Paket Pemulihan 3 Sesi (Rp 400.000)'}

💡 *Tips Persiapan:*
- Kenakan pakaian longgar/nyaman (kaos & celana training).
- Hindari makan berat 1 jam sebelum sesi terapi.
- Mohon hadir 10 menit lebih awal.

📝 *Pra-Pemeriksaan Awal (Opsional tapi Sangat Dianjurkan):*
Agar terapis kami dapat mempelajari perkembangan kondisi Anda sebelum tiba, silakan isi formulir singkat & foto obat/hasil lab di sini:
🔗 ${intakeUrl}
*(Gunakan 4 digit terakhir nomor WhatsApp Anda: **${pinLast4}** sebagai PIN masuk)*

Sampai jumpa di Ruang Pulih Makassar!`;

      const waQueueInserts: Array<{
        appointment_id: string;
        patient_id: string;
        trigger_type: 'BOOKING' | 'H_MINUS_1' | 'H_MINUS_2H';
        scheduled_for: string;
        message_body: string;
        status: 'PENDING';
        retry_count: number;
      }> = [
        {
          appointment_id: appointmentId,
          patient_id: patientId,
          trigger_type: 'BOOKING',
          scheduled_for: new Date(nowMs).toISOString(),
          message_body: bookingMessageBody,
          status: 'PENDING',
          retry_count: 0,
        },
      ];

      const hMinus1Ms = new Date(triggers.hMinus1).getTime();
      if (hMinus1Ms > nowMs) {
        const hMinus1Body = `Halo *${payload.full_name}*, kami ingin mengingatkan jadwal terapi Anda di Ruang Pulih Makassar besok:

📅 *Waktu:* Besok pukul ${formattedTime}
📍 *Lokasi:* Jl. Batua Raya 10B No. 9, Makassar

Mohon pastikan kehadiran Anda tepat waktu. Jika berhalangan hadir atau ingin mengubah jam, silakan hubungi kami agar slot dapat kami alihkan untuk pasien lain. Terima kasih!`;

        waQueueInserts.push({
          appointment_id: appointmentId,
          patient_id: patientId,
          trigger_type: 'H_MINUS_1',
          scheduled_for: triggers.hMinus1,
          message_body: hMinus1Body,
          status: 'PENDING',
          retry_count: 0,
        });
      }

      const hMinus2hMs = new Date(triggers.hMinus2h).getTime();
      if (hMinus2hMs > nowMs) {
        const hMinus2hBody = `Halo *${payload.full_name}*, 2 jam lagi sesi terapi Anda di Ruang Pulih Makassar akan dimulai:

⏰ *Waktu:* Hari ini pukul ${formattedTime}
📍 *Alamat:* Jl. Batua Raya 10B No. 9, Makassar (Maps: ${gmapsUrl})

Petunjuk rute: Masuk melalui Jl. Batua Raya, lokasi klinik berada di sebelah kiri jalan. Terapis kami siap menyambut Anda!`;

        waQueueInserts.push({
          appointment_id: appointmentId,
          patient_id: patientId,
          trigger_type: 'H_MINUS_2H',
          scheduled_for: triggers.hMinus2h,
          message_body: hMinus2hBody,
          status: 'PENDING',
          retry_count: 0,
        });
      }

      const { data: insertedQueue, error: waQueueError } = await admin
        .from('wa_queue')
        .insert(waQueueInserts)
        .select('id, trigger_type');

      if (!waQueueError) {
        waQueued = true;

        // Instant send via Fonnte
        const bookingQueueItem = (insertedQueue || []).find((q) => q.trigger_type === 'BOOKING');
        if (bookingQueueItem && process.env.FONNTE_TOKEN) {
          try {
            const fonnteRes = await sendWhatsAppViaFonnte({
              target: normalizedPhone,
              message: bookingMessageBody,
              delay: '2-5',
              timeoutMs: 4000,
            });
            if (fonnteRes.success) {
              waSentInstant = true;
              await admin
                .from('wa_queue')
                .update({ status: 'SENT', sent_at: new Date().toISOString() })
                .eq('id', bookingQueueItem.id);
            }
          } catch (fonnteErr) {
            console.warn('[Admin Manual Book] Instant Fonnte send caught:', fonnteErr);
          }
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        appointment,
        patient: {
          id: patientId,
          full_name: payload.full_name,
          whatsapp: normalizedPhone,
          magic_token: magicToken,
          pin_last4: pinLast4,
        },
        wa_queued: waQueued,
        wa_sent_instant: waSentInstant,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors[0]?.message || 'Validasi input gagal.', details: err.errors },
        { status: 400 }
      );
    }

    console.error('[Admin Manual Book] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server saat menyimpan jadwal manual.' },
      { status: 500 }
    );
  }
}
