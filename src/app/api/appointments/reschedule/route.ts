import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import {
  calculateWAFollowUpTriggers,
  formatWITADateTime,
  formatWITATime,
  getWITAParts,
  createWITAISOString,
} from '@/lib/utils/timezone';
import { sendWhatsAppViaFonnte } from '@/lib/wa/fonnte';

export const dynamic = 'force-dynamic';

const RescheduleSchema = z.object({
  appointment_id: z.string().uuid('ID reservasi tidak valid'),
  magic_token: z.string().min(6, 'Token pasien tidak valid'),
  new_slot_start: z.string().min(10, 'Waktu slot baru tidak valid'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = RescheduleSchema.parse(json);

    const admin = createAdminClient();

    // 1. Verify appointment and ownership via magic_token
    const { data: appointment, error: fetchError } = await admin
      .from('appointments')
      .select('id, patient_id, package_type, status, slot_start, patients(id, full_name, whatsapp, magic_token, pin_last4)')
      .eq('id', payload.appointment_id)
      .single();

    if (fetchError || !appointment) {
      return NextResponse.json(
        { error: 'Jadwal reservasi tidak ditemukan.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const patient = appointment.patients as unknown as {
      id: string;
      full_name: string;
      whatsapp: string;
      magic_token: string;
      pin_last4: string;
    };

    if (!patient || patient.magic_token !== payload.magic_token) {
      return NextResponse.json(
        { error: 'Akses ditolak: Token verifikasi pasien tidak sesuai.', code: 'UNAUTHORIZED' },
        { status: 403 }
      );
    }

    // 2. Calculate new slot_end (+60 minutes)
    const newStartDate = new Date(payload.new_slot_start);
    if (isNaN(newStartDate.getTime())) {
      return NextResponse.json(
        { error: 'Format tanggal slot baru tidak valid.', code: 'INVALID_DATE' },
        { status: 400 }
      );
    }

    const newEndDate = new Date(newStartDate.getTime() + 60 * 60 * 1000);
    const endParts = getWITAParts(newEndDate);
    const newSlotEndIso = createWITAISOString(
      endParts.year,
      endParts.month,
      endParts.day,
      endParts.hour,
      endParts.minute,
      0
    );

    // 3. Atomically update slot in appointments with double-booking protection
    const { data: updatedAppt, error: updateError } = await admin
      .from('appointments')
      .update({
        slot_start: payload.new_slot_start,
        slot_end: newSlotEndIso,
        status: 'BOOKED',
      })
      .eq('id', payload.appointment_id)
      .select('id, slot_start, slot_end, status')
      .single();

    if (updateError) {
      if (
        updateError.code === '23505' ||
        updateError.message?.includes('idx_unique_active_slot') ||
        updateError.message?.toLowerCase().includes('unique')
      ) {
        return NextResponse.json(
          {
            error: 'Maaf, slot jam baru ini baru saja diambil pasien lain. Silakan pilih jam kosong lainnya.',
            code: 'SLOT_ALREADY_BOOKED',
          },
          { status: 409 }
        );
      }

      console.error('[Reschedule API] Update error:', updateError);
      return NextResponse.json(
        { error: 'Gagal memperbarui jadwal reservasi.' },
        { status: 500 }
      );
    }

    // 4. Cancel previous pending wa_queue messages for this appointment
    await admin
      .from('wa_queue')
      .update({ status: 'CANCELLED' })
      .eq('appointment_id', payload.appointment_id)
      .eq('status', 'PENDING');

    // 5. Enqueue new WA notifications for the rescheduled appointment
    const triggers = calculateWAFollowUpTriggers(payload.new_slot_start);
    const formattedDateTime = formatWITADateTime(newStartDate);
    const formattedTime = formatWITATime(newStartDate);
    const nowMs = Date.now();

    const gmapsUrl =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL ||
      process.env.NEXT_PUBLIC_GMAPS_REVIEW_URL ||
      'https://maps.google.com/?q=Ruang+Pulih+Makassar';
    const intakeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/intake/${patient.magic_token}`;

    const rescheduleMsg = `Halo *${patient.full_name}*, jadwal terapi Anda di *Ruang Pulih Makassar* telah berhasil DIUBAH (Reschedule):

📅 *Jadwal Baru:* ${formattedDateTime}
📍 *Alamat:* Jl. Batua Raya 10B No. 9, Makassar (Maps: ${gmapsUrl})
🏷️ *Paket:* ${appointment.package_type === 'SINGLE_150K' ? 'Sesi Awal (Rp 150.000)' : 'Paket Pemulihan 3 Sesi (Rp 400.000)'}

Silakan lengkapi pra-pemeriksaan mandiri Anda sebelum hadir:
🔗 ${intakeUrl} (PIN: ${patient.pin_last4})

Sampai jumpa di Ruang Pulih Makassar!`;

    const newWaQueue: Array<{
      appointment_id: string;
      patient_id: string;
      trigger_type: 'BOOKING' | 'H_MINUS_1' | 'H_MINUS_2H';
      scheduled_for: string;
      message_body: string;
      status: 'PENDING';
      retry_count: number;
    }> = [
      {
        appointment_id: payload.appointment_id,
        patient_id: patient.id,
        trigger_type: 'BOOKING',
        scheduled_for: new Date(nowMs).toISOString(),
        message_body: rescheduleMsg,
        status: 'PENDING',
        retry_count: 0,
      },
    ];

    // H_MINUS_1 (only if in future)
    if (new Date(triggers.hMinus1).getTime() > nowMs) {
      newWaQueue.push({
        appointment_id: payload.appointment_id,
        patient_id: patient.id,
        trigger_type: 'H_MINUS_1',
        scheduled_for: triggers.hMinus1,
        message_body: `Halo *${patient.full_name}*, pengingat jadwal baru Anda besok di Ruang Pulih Makassar pukul ${formattedTime}. Mohon konfirmasi kehadiran Anda.`,
        status: 'PENDING',
        retry_count: 0,
      });
    }

    // H_MINUS_2H (only if in future)
    if (new Date(triggers.hMinus2h).getTime() > nowMs) {
      newWaQueue.push({
        appointment_id: payload.appointment_id,
        patient_id: patient.id,
        trigger_type: 'H_MINUS_2H',
        scheduled_for: triggers.hMinus2h,
        message_body: `Halo *${patient.full_name}*, pengingat: Sesi terapi baru Anda akan dimulai dalam 2 jam (pukul ${formattedTime}) di Jl. Batua Raya 10B No. 9 Makassar.`,
        status: 'PENDING',
        retry_count: 0,
      });
    }

    let rescheduleQueueId: string | null = null;
    try {
      const { data: insertedQueue, error: insertQueueError } = await admin
        .from('wa_queue')
        .insert(newWaQueue)
        .select('id, trigger_type');

      if (!insertQueueError && insertedQueue) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bookingRow = (insertedQueue as any[]).find((q) => q.trigger_type === 'BOOKING');
        if (bookingRow) {
          rescheduleQueueId = bookingRow.id;
        }
      }
    } catch (waErr) {
      console.warn('[Reschedule API] Failed to re-queue WA messages:', waErr);
    }

    // Instant WA Delivery for Rescheduled Booking (Non-blocking, max 4s timeout)
    if (process.env.FONNTE_TOKEN && rescheduleQueueId) {
      try {
        const sendResult = await sendWhatsAppViaFonnte({
          target: patient.whatsapp,
          message: rescheduleMsg,
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
            .eq('id', rescheduleQueueId);
        } else {
          await admin
            .from('wa_queue')
            .update({
              last_error: sendResult.error || 'Instant reschedule send failed, scheduled for cron retry',
            })
            .eq('id', rescheduleQueueId);
        }
      } catch (instantErr) {
        console.warn('[Reschedule API] Instant WA send error (will retry via cron):', instantErr);
        await admin
          .from('wa_queue')
          .update({
            last_error: (instantErr as Error).message || 'Instant reschedule send exception',
          })
          .eq('id', rescheduleQueueId);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Jadwal berhasil dipindahkan.',
      appointment: {
        id: updatedAppt.id,
        slot_start: updatedAppt.slot_start,
        slot_end: updatedAppt.slot_end,
        time_formatted: formattedDateTime,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Reschedule API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat mengubah jadwal.' },
      { status: 500 }
    );
  }
}
