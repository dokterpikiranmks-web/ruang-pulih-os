import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ReviewSubmitSchema = z.object({
  appointment_id: z.string().uuid('ID Reservasi tidak valid'),
  rating: z.number().int().min(1).max(5),
  feedback_text: z.string().max(1000).optional().default(''),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = ReviewSubmitSchema.parse(json);

    const admin = createAdminClient();

    // 1. Fetch appointment to identify patient
    const { data: appt, error: apptError } = await admin
      .from('appointments')
      .select('id, patient_id')
      .eq('id', payload.appointment_id)
      .single();

    if (apptError || !appt) {
      return NextResponse.json(
        { error: 'Jadwal reservasi tidak ditemukan.' },
        { status: 404 }
      );
    }

    const routedToGmaps = payload.rating >= 4;
    const gmapsUrl =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL ||
      'https://maps.app.goo.gl/placeholder-ruang-pulih-makassar';

    // 2. Insert or update in patient_reviews (Migration 002)
    const { data: reviewRecord, error: reviewError } = await admin
      .from('patient_reviews')
      .upsert(
        {
          appointment_id: payload.appointment_id,
          patient_id: appt.patient_id,
          rating: payload.rating,
          feedback_text: payload.feedback_text || null,
          routed_to_gmaps: routedToGmaps,
        },
        { onConflict: 'appointment_id' }
      )
      .select('id')
      .single();

    if (reviewError) {
      console.error('[Review Submit API] Error inserting patient_reviews:', reviewError);
      return NextResponse.json(
        { error: 'Gagal menyimpan ulasan.' },
        { status: 500 }
      );
    }

    // Also populate review_feedbacks for backwards compatibility
    await admin.from('review_feedbacks').upsert(
      {
        appointment_id: payload.appointment_id,
        patient_id: appt.patient_id,
        rating: payload.rating,
        comment: payload.feedback_text || null,
        routed_to_gmaps: routedToGmaps,
      },
      { onConflict: 'appointment_id' }
    );

    return NextResponse.json({
      success: true,
      review_id: reviewRecord.id,
      rating: payload.rating,
      routed_to_gmaps: routedToGmaps,
      gmaps_url: routedToGmaps ? gmapsUrl : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Data ulasan tidak valid', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Review Submit API] Error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menyimpan ulasan.' },
      { status: 500 }
    );
  }
}
