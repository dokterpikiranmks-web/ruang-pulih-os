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

const BookAppointmentSchema = z.object({
  lead_id: z.string().optional().nullable(),
  full_name: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  age: z.coerce.number().min(10, 'Usia minimal 10 tahun').max(100, 'Usia maksimal 100 tahun'),
  whatsapp: z.string().min(8, 'Nomor WhatsApp tidak valid'),
  address: z.string().min(3, 'Alamat / kecamatan minimal 3 karakter'),
  complaint_summary: z.string().min(2, 'Keluhan singkat wajib diisi'),
  package_type: z.enum(['SINGLE_150K', 'PACKAGE_3X_400K']),
  slot_start: z.string().min(10, 'Waktu slot tidak valid'),
  disclaimer_accepted: z.boolean(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
  fbclid: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = BookAppointmentSchema.parse(json);

    // 1. Mandatory Disclaimer Check
    if (payload.disclaimer_accepted !== true) {
      return NextResponse.json(
        {
          error: 'Persetujuan disclaimer wajib dicentang sebelum melakukan reservasi jadwal.',
          code: 'DISCLAIMER_REQUIRED',
        },
        { status: 400 }
      );
    }

    // 2. Normalize Indonesian Phone Number
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

    // 3. Calculate slot_end (60 minutes after slot_start)
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

    // 4. Find or Create Patient record
    let patientId: string;
    let magicToken: string;

    const { data: existingPatient } = await admin
      .from('patients')
      .select('id, magic_token')
      .eq('whatsapp', normalizedPhone)
      .maybeSingle();

    if (existingPatient) {
      patientId = existingPatient.id;
      magicToken = existingPatient.magic_token;

      // Update patient profile info
      await admin
        .from('patients')
        .update({
          full_name: payload.full_name,
          age: payload.age,
          address: payload.address,
          pin_last4: pinLast4,
        })
        .eq('id', patientId);
    } else {
      magicToken = `rp-${crypto.randomBytes(8).toString('hex')}`;

      const { data: newPatient, error: patientCreateError } = await admin
        .from('patients')
        .insert({
          full_name: payload.full_name,
          age: payload.age,
          whatsapp: normalizedPhone,
          address: payload.address,
          magic_token: magicToken,
          pin_last4: pinLast4,
        })
        .select('id')
        .single();

      if (patientCreateError || !newPatient) {
        console.error('[Booking API] Failed to create patient:', patientCreateError);
        return NextResponse.json(
          { error: 'Gagal membuat profil pasien di sistem.' },
          { status: 500 }
        );
      }
      patientId = newPatient.id;
    }

    // 5. Update leads_triage disclaimer acceptance and fetch UTM fallback if needed
    let utmSource = payload.utm_source || null;
    let utmMedium = payload.utm_medium || null;
    let utmCampaign = payload.utm_campaign || null;
    let utmContent = payload.utm_content || null;
    let fbclid = payload.fbclid || null;

    if (payload.lead_id) {
      const { data: leadData } = await admin
        .from('leads_triage')
        .select('utm_source, utm_medium, utm_campaign, utm_content, fbclid')
        .eq('id', payload.lead_id)
        .maybeSingle();

      if (leadData) {
        utmSource = utmSource || leadData.utm_source || null;
        utmMedium = utmMedium || leadData.utm_medium || null;
        utmCampaign = utmCampaign || leadData.utm_campaign || null;
        utmContent = utmContent || leadData.utm_content || null;
        fbclid = fbclid || leadData.fbclid || null;
      }

      await admin
        .from('leads_triage')
        .update({ disclaimer_accepted: true })
        .eq('id', payload.lead_id);
    }

    // 6. Insert Appointment with Anti-Double-Booking Protection
    const { data: appointment, error: apptError } = await admin
      .from('appointments')
      .insert({
        patient_id: patientId,
        lead_id: payload.lead_id || null,
        slot_start: payload.slot_start,
        slot_end: slotEndIso,
        package_type: payload.package_type,
        status: 'BOOKED',
        amount_paid_idr: 0,
        notes: payload.complaint_summary,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        fbclid: fbclid,
      })
      .select('id')
      .single();

    if (apptError) {
      // Check PostgreSQL unique violation error code 23505
      // (idx_unique_active_slot triggered when another patient booked the same slot)
      if (
        apptError.code === '23505' ||
        apptError.message?.includes('idx_unique_active_slot') ||
        apptError.message?.toLowerCase().includes('unique')
      ) {
        return NextResponse.json(
          {
            error: 'Maaf, slot jam ini baru saja diambil pasien lain. Silakan pilih jam kosong lainnya.',
            code: 'SLOT_ALREADY_BOOKED',
          },
          { status: 409 }
        );
      }

      console.error('[Booking API] Appointment insert error:', apptError);
      return NextResponse.json(
        { error: 'Gagal memesan slot jadwal. Silakan coba lagi.' },
        { status: 500 }
      );
    }

    const appointmentId = appointment.id;
    const nowMs = Date.now();
    const formattedDateTime = formatWITADateTime(slotStartDate);
    const formattedTime = formatWITATime(slotStartDate);

    // 7. Enqueue initial WhatsApp lifecycle messages (3 pre-visit triggers)
    const triggers = calculateWAFollowUpTriggers(payload.slot_start);
    const intakeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/intake/${magicToken}`;
    const gmapsUrl =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL ||
      process.env.NEXT_PUBLIC_GMAPS_REVIEW_URL ||
      'https://maps.google.com/?q=Ruang+Pulih+Makassar';

    // Queue Message 1: BOOKING Confirmation (immediate)
    const bookingMessageBody = `Halo *${payload.full_name}*, terima kasih telah membuat janji di *Ruang Pulih Makassar*.

📅 *Jadwal Terapi:* ${formattedDateTime}
📍 *Alamat Klinik:* Jl. Batua Raya 10B No. 9, Makassar
🗺️ *Google Maps:* ${gmapsUrl}
🏷️ *Pilihan Paket:* ${payload.package_type === 'SINGLE_150K' ? 'Sesi Awal 60 Menit (Rp 150.000)' : 'Paket Pemulihan 3 Sesi (Rp 400.000)'}

💡 *Tips Persiapan:*
- Kenakan pakaian longgar/nyaman (kaos & celana training).
- Hindari makan berat 1 jam sebelum sesi terapi.
- Mohon hadir 10 menit lebih awal.

📝 *Pra-Pemeriksaan Awal (Opsional tapi Sangat Dianjurkan):*
Agar terapis kami dapat mempelajari kondisi Anda sebelum tiba, silakan isi formulir singkat & foto obat/hasil lab Anda di sini:
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

    // Queue Message 2: H_MINUS_1 (only if scheduled_for is in the future)
    const hMinus1Ms = new Date(triggers.hMinus1).getTime();
    if (hMinus1Ms > nowMs) {
      const hMinus1Body = `Halo *${payload.full_name}*, kami ingin mengingatkan jadwal terapi Anda di Ruang Pulih Makassar besok:

📅 *Waktu:* Besok pukul ${formattedTime}
📍 *Lokasi:* Jl. Batua Raya 10B No. 9, Makassar

Mohon pastikan kehadiran Anda tepat waktu. Jika berhalangan hadir atau ingin mengubah jam, silakan balas pesan ini agar slot dapat kami alihkan untuk pasien lain yang membutuhkan. Terima kasih!`;

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

    // Queue Message 3: H_MINUS_2H (only if scheduled_for is in the future)
    const hMinus2hMs = new Date(triggers.hMinus2h).getTime();
    if (hMinus2hMs > nowMs) {
      const hMinus2hBody = `Halo *${payload.full_name}*, pengingat keberangkatan: Sesi terapi Anda di Ruang Pulih Makassar akan dimulai dalam 2 jam (pukul ${formattedTime}).

Ruangan dan terapis kami di Jl. Batua Raya 10B No. 9 Makassar telah siap menyambut Anda. Hati-hati di jalan!`;

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

    let bookingQueueId: string | null = null;
    try {
      const { data: insertedQueue, error: insertQueueError } = await admin
        .from('wa_queue')
        .insert(waQueueInserts)
        .select('id, trigger_type');

      if (!insertQueueError && insertedQueue) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bookingRow = (insertedQueue as any[]).find((q) => q.trigger_type === 'BOOKING');
        if (bookingRow) {
          bookingQueueId = bookingRow.id;
        }
      }
    } catch (waErr) {
      console.warn('[Booking API] Failed to enqueue WA messages (non-blocking):', waErr);
    }

    // Instant WA Delivery (Non-blocking, max 4s timeout)
    if (process.env.FONNTE_TOKEN && bookingQueueId) {
      try {
        const sendResult = await sendWhatsAppViaFonnte({
          target: normalizedPhone,
          message: bookingMessageBody,
          delay: '2-5',
          timeoutMs: 4000,
        });

        if (sendResult.success) {
          await admin
            .from('wa_queue')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
            })
            .eq('id', bookingQueueId);
        } else {
          await admin
            .from('wa_queue')
            .update({
              last_error: sendResult.error || 'Instant send failed, scheduled for cron retry',
            })
            .eq('id', bookingQueueId);
        }
      } catch (instantErr) {
        console.warn('[Booking API] Instant WA send error (will retry via cron):', instantErr);
        await admin
          .from('wa_queue')
          .update({
            last_error: (instantErr as Error).message || 'Instant send exception',
          })
          .eq('id', bookingQueueId);
      }
    }

    return NextResponse.json(
      {
        success: true,
        booking: {
          appointment_id: appointmentId,
          patient_id: patientId,
          full_name: payload.full_name,
          whatsapp: normalizedPhone,
          package_type: payload.package_type,
          slot_start: payload.slot_start,
          slot_end: slotEndIso,
          time_formatted: formattedDateTime,
          magic_token: magicToken,
          pin_last4: pinLast4,
          intake_url: `/intake/${magicToken}`,
          location: 'Jl. Batua Raya 10B No. 9, Makassar',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Booking API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat memproses booking.' },
      { status: 500 }
    );
  }
}
