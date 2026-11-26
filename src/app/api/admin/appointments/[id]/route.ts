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

const EditAppointmentSchema = z.object({
  slot_start: z.string().min(10).optional(),
  status: z
    .enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED'])
    .optional(),
  complaint_summary: z.string().optional().nullable(),
  package_type: z.enum(['SINGLE_150K', 'PACKAGE_3X_400K']).optional(),
  amount_paid_idr: z.number().int().min(0).optional(),
  notify_patient_wa: z.boolean().optional().default(false),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const appointmentId = resolvedParams.id;

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'ID Reservasi wajib diisi.', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const payload = EditAppointmentSchema.parse(json);

    const admin = createAdminClient();

    // 1. Fetch current appointment and patient
    const { data: currentAppt, error: fetchErr } = await admin
      .from('appointments')
      .select('id, patient_id, lead_id, slot_start, slot_end, package_type, status, amount_paid_idr, notes, patients(id, full_name, whatsapp, magic_token, pin_last4)')
      .eq('id', appointmentId)
      .single();

    if (fetchErr || !currentAppt) {
      return NextResponse.json(
        { error: 'Jadwal reservasi tidak ditemukan.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const patient = currentAppt.patients as unknown as {
      id: string;
      full_name: string;
      whatsapp: string;
      magic_token: string;
      pin_last4: string;
    };

    const updateData: {
      slot_start?: string;
      slot_end?: string;
      status?: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED' | 'CANCELLED';
      notes?: string | null;
      package_type?: 'SINGLE_150K' | 'PACKAGE_3X_400K';
      amount_paid_idr?: number;
    } = {};

    let isSlotChanged = false;
    let slotStartDate: Date | null = null;

    // 2. Handle slot change
    if (payload.slot_start && payload.slot_start !== currentAppt.slot_start) {
      slotStartDate = new Date(payload.slot_start);
      if (isNaN(slotStartDate.getTime())) {
        return NextResponse.json(
          { error: 'Format tanggal slot baru tidak valid.', code: 'INVALID_DATE' },
          { status: 400 }
        );
      }

      const slotEndDate = new Date(slotStartDate.getTime() + 60 * 60 * 1000);
      const endParts = getWITAParts(slotEndDate);
      const newSlotEndIso = createWITAISOString(
        endParts.year,
        endParts.month,
        endParts.day,
        endParts.hour,
        endParts.minute,
        0
      );

      updateData.slot_start = payload.slot_start;
      updateData.slot_end = newSlotEndIso;
      isSlotChanged = true;

      // If status is not explicitly set, keep it active (CONFIRMED)
      if (!payload.status) {
        updateData.status = 'CONFIRMED';
      }
    }

    // 3. Handle status change
    if (payload.status) {
      updateData.status = payload.status;
    }

    // 4. Handle other metadata fields
    if (payload.complaint_summary !== undefined) {
      updateData.notes = payload.complaint_summary;
    }

    if (payload.package_type) {
      updateData.package_type = payload.package_type;
    }

    if (payload.amount_paid_idr !== undefined) {
      updateData.amount_paid_idr = payload.amount_paid_idr;
    } else if (payload.status === 'COMPLETED' && currentAppt.amount_paid_idr === 0) {
      // Default auto-fill amount paid for completed session if not set
      updateData.amount_paid_idr =
        (updateData.package_type || currentAppt.package_type) === 'PACKAGE_3X_400K'
          ? 400000
          : 150000;
    }

    // 5. Execute appointment update with collision check
    const { data: updatedAppt, error: updateErr } = await admin
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId)
      .select('id, patient_id, slot_start, slot_end, package_type, status, amount_paid_idr, notes')
      .single();

    if (updateErr) {
      if (
        updateErr.code === '23505' ||
        updateErr.message?.includes('idx_unique_active_slot') ||
        updateErr.message?.toLowerCase().includes('unique')
      ) {
        return NextResponse.json(
          {
            error: 'Slot sesi ini sudah terisi pasien lain. Pilih tanggal atau sesi lain.',
            code: 'SLOT_ALREADY_BOOKED',
          },
          { status: 409 }
        );
      }

      console.error('[Admin Appointment Edit] Update error:', updateErr);
      return NextResponse.json(
        { error: 'Gagal memperbarui reservasi jadwal.', details: updateErr.message },
        { status: 500 }
      );
    }

    // 6. Handle Cancellation: cancel all PENDING queue items
    if (updateData.status === 'CANCELLED') {
      await admin
        .from('wa_queue')
        .update({ status: 'CANCELLED' })
        .eq('appointment_id', appointmentId)
        .eq('status', 'PENDING');
    }

    // 7. Handle Slot Change WA notifications
    let waNotified = false;
    if (isSlotChanged) {
      // Cancel previous pending messages so old time reminders don't send
      await admin
        .from('wa_queue')
        .update({ status: 'CANCELLED' })
        .eq('appointment_id', appointmentId)
        .eq('status', 'PENDING');

      if (payload.notify_patient_wa && slotStartDate && patient?.whatsapp) {
        const triggers = calculateWAFollowUpTriggers(payload.slot_start!);
        const formattedDateTime = formatWITADateTime(slotStartDate);
        const formattedTime = formatWITATime(slotStartDate);
        const nowMs = Date.now();

        const gmapsUrl =
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL ||
          process.env.NEXT_PUBLIC_GMAPS_REVIEW_URL ||
          'https://maps.google.com/?q=Ruang+Pulih+Makassar';
        const intakeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/intake/${patient.magic_token}`;
        const activePkg = updateData.package_type || currentAppt.package_type;

        const rescheduleMsg = `Halo *${patient.full_name}*, jadwal terapi Anda di *Ruang Pulih Makassar* telah disesuaikan oleh praktisi:

📅 *Jadwal Baru:* ${formattedDateTime}
📍 *Alamat:* Jl. Batua Raya 10B No. 9, Makassar (Maps: ${gmapsUrl})
🏷️ *Paket:* ${activePkg === 'SINGLE_150K' ? 'Sesi Awal (Rp 150.000)' : 'Paket Pemulihan 3 Sesi (Rp 400.000)'}

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
            appointment_id: appointmentId,
            patient_id: patient.id,
            trigger_type: 'BOOKING',
            scheduled_for: new Date(nowMs).toISOString(),
            message_body: rescheduleMsg,
            status: 'PENDING',
            retry_count: 0,
          },
        ];

        const hMinus1Ms = new Date(triggers.hMinus1).getTime();
        if (hMinus1Ms > nowMs) {
          const hMinus1Body = `Halo *${patient.full_name}*, pengingat jadwal terapi Anda di Ruang Pulih Makassar besok:

📅 *Waktu:* Besok pukul ${formattedTime}
📍 *Lokasi:* Jl. Batua Raya 10B No. 9, Makassar

Mohon konfirmasi kehadiran Anda. Terima kasih!`;

          newWaQueue.push({
            appointment_id: appointmentId,
            patient_id: patient.id,
            trigger_type: 'H_MINUS_1',
            scheduled_for: triggers.hMinus1,
            message_body: hMinus1Body,
            status: 'PENDING',
            retry_count: 0,
          });
        }

        const hMinus2hMs = new Date(triggers.hMinus2h).getTime();
        if (hMinus2hMs > nowMs) {
          const hMinus2hBody = `Halo *${patient.full_name}*, 2 jam lagi sesi terapi Anda di Ruang Pulih Makassar akan dimulai:

⏰ *Waktu:* Hari ini pukul ${formattedTime}
📍 *Alamat:* Jl. Batua Raya 10B No. 9, Makassar (Maps: ${gmapsUrl})

Petunjuk rute: Jl. Batua Raya 10B No. 9. Terapis kami siap menyambut Anda!`;

          newWaQueue.push({
            appointment_id: appointmentId,
            patient_id: patient.id,
            trigger_type: 'H_MINUS_2H',
            scheduled_for: triggers.hMinus2h,
            message_body: hMinus2hBody,
            status: 'PENDING',
            retry_count: 0,
          });
        }

        const { data: insertedQueue } = await admin
          .from('wa_queue')
          .insert(newWaQueue)
          .select('id, trigger_type');

        const bookingQueueItem = (insertedQueue || []).find((q) => q.trigger_type === 'BOOKING');
        if (bookingQueueItem && process.env.FONNTE_TOKEN) {
          try {
            const fonnteRes = await sendWhatsAppViaFonnte({
              target: patient.whatsapp,
              message: rescheduleMsg,
              delay: '2-5',
              timeoutMs: 4000,
            });
            if (fonnteRes.success) {
              await admin
                .from('wa_queue')
                .update({ status: 'SENT', sent_at: new Date().toISOString() })
                .eq('id', bookingQueueItem.id);
            }
          } catch (fErr) {
            console.warn('[Admin Appointment Edit] Fonnte send caught:', fErr);
          }
        }
        waNotified = true;
      }
    }

    return NextResponse.json({
      success: true,
      appointment: updatedAppt,
      wa_notified: waNotified,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.errors[0]?.message || 'Validasi input gagal.', details: err.errors },
        { status: 400 }
      );
    }

    console.error('[Admin Appointment Edit] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server saat memperbarui reservasi.' },
      { status: 500 }
    );
  }
}
