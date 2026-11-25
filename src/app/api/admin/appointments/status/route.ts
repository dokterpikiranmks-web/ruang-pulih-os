import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { createWITAISOString, getWITAParts } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

const UpdateStatusSchema = z.object({
  appointment_id: z.string().uuid('ID Reservasi tidak valid'),
  status: z.enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED']),
  amount_paid_idr: z.number().int().min(0).optional().default(0),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = UpdateStatusSchema.parse(json);

    const admin = createAdminClient();

    // 1. Fetch current appointment & patient info
    const { data: appt, error: fetchErr } = await admin
      .from('appointments')
      .select('id, patient_id, package_type, slot_start, patients(id, full_name, whatsapp, magic_token)')
      .eq('id', payload.appointment_id)
      .single();

    if (fetchErr || !appt) {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan.' }, { status: 404 });
    }

    const patient = appt.patients as unknown as {
      id: string;
      full_name: string;
      whatsapp: string;
      magic_token: string;
    };

    // 2. Update status and payment
    const updateData: {
      status: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED';
      amount_paid_idr?: number;
    } = {
      status: payload.status,
    };

    if (payload.status === 'COMPLETED' && payload.amount_paid_idr > 0) {
      updateData.amount_paid_idr = payload.amount_paid_idr;
    }

    const { error: updateErr } = await admin
      .from('appointments')
      .update(updateData)
      .eq('id', payload.appointment_id);

    if (updateErr) {
      console.error('[Admin Status API] Update error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui status reservasi.' }, { status: 500 });
    }

    const nowMs = Date.now();

    // 3. Logic when status becomes COMPLETED -> Enqueue POST_REVIEW (+2h) and H_PLUS_3 (+3 days)
    if (payload.status === 'COMPLETED') {
      const postReviewTime = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();

      // H+3 days at 10:00 WITA
      const hPlus3Date = new Date(nowMs + 3 * 24 * 60 * 60 * 1000);
      const hPlus3Parts = getWITAParts(hPlus3Date);
      const hPlus3Iso = createWITAISOString(
        hPlus3Parts.year,
        hPlus3Parts.month,
        hPlus3Parts.day,
        10,
        0,
        0
      );

      const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/review/${payload.appointment_id}`;
      const patientPwaUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ruangpulihmakassar.com'}/p/${patient.magic_token}`;

      const postReviewBody = `Terima kasih atas kunjungan terapi Anda hari ini di *Ruang Pulih Makassar*, Bapak/Ibu *${patient.full_name}*.

Bagaimana perasaan tubuh Anda pasca sesi terapi totok saraf tadi? Kami sangat menghargai masukan Anda untuk peningkatan pelayanan kami:
⭐ Berikan Ulasan Anda: ${reviewUrl}

Pantau terus catatan protokol mandiri dan progres pemulihan Anda di Aplikasi Pasien Ruang Pulih:
📱 Akses Aplikasi: ${patientPwaUrl}`;

      const hPlus3Body = `Halo Bapak/Ibu *${patient.full_name}*, ini adalah pesan pemantauan (follow-up) H+3 dari Ruang Pulih Makassar.

Bagaimana perkembangan keluhan dan rasa nyaman di tubuh Anda setelah beberapa hari istirahat dan menjalankan panduan di rumah?
Jika Anda ingin menjadwalkan sesi terapi lanjutan untuk melanjutkan penguraian akar masalah, silakan hubungi kami atau buka kartu sesi di aplikasi pasien Anda:
📱 ${patientPwaUrl}`;

      await admin.from('wa_queue').insert([
        {
          appointment_id: payload.appointment_id,
          patient_id: patient.id,
          trigger_type: 'POST_REVIEW',
          scheduled_for: postReviewTime,
          message_body: postReviewBody,
          status: 'PENDING',
          retry_count: 0,
        },
        {
          appointment_id: payload.appointment_id,
          patient_id: patient.id,
          trigger_type: 'H_PLUS_3',
          scheduled_for: hPlus3Iso,
          message_body: hPlus3Body,
          status: 'PENDING',
          retry_count: 0,
        },
      ]);
    }

    // 4. Logic when status becomes NO_SHOW -> Cancel all pending WA messages for this appointment
    if (payload.status === 'NO_SHOW') {
      await admin
        .from('wa_queue')
        .update({ status: 'CANCELLED' })
        .eq('appointment_id', payload.appointment_id)
        .eq('status', 'PENDING');
    }

    return NextResponse.json({
      success: true,
      appointment_id: payload.appointment_id,
      status: payload.status,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Admin Status API] Unexpected error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
}
