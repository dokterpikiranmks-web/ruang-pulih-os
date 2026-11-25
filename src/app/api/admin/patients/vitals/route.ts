import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VitalsSchema = z.object({
  patient_id: z.string().uuid('ID Pasien tidak valid'),
  blood_pressure: z.string().default('120/80'),
  heart_rate: z.coerce.number().default(75),
  palpation_findings: z.string().default(''),
  practitioner_notes: z.string().default(''),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = VitalsSchema.parse(json);

    const admin = createAdminClient();

    // Check if intake exists for this patient
    const { data: intake } = await admin
      .from('patient_intakes')
      .select('id, confidence_score')
      .eq('patient_id', payload.patient_id)
      .maybeSingle();

    const vitalsData = {
      blood_pressure: payload.blood_pressure,
      heart_rate: payload.heart_rate,
      palpation_findings: payload.palpation_findings,
    };

    if (intake) {
      // Update with Layer 3 Practitioner vitals & boost confidence to 95%
      await admin
        .from('patient_intakes')
        .update({
          practitioner_vitals_json: vitalsData,
          practitioner_notes: payload.practitioner_notes,
          confidence_score: 95,
          updated_at: new Date().toISOString(),
        })
        .eq('id', intake.id);
    } else {
      // Create fresh intake record with 95% confidence
      await admin
        .from('patient_intakes')
        .insert({
          patient_id: payload.patient_id,
          practitioner_vitals_json: vitalsData,
          practitioner_notes: payload.practitioner_notes,
          confidence_score: 95,
        });
    }

    return NextResponse.json({
      success: true,
      confidence_score: 95,
      message: 'Pemeriksaan fisik Lapisan 3 berhasil dicatat (Keyakinan Akurasi 95%).',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Admin Vitals API] Unexpected error:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
}
