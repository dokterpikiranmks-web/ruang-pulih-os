import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { calculateConfidenceScore } from '@/lib/intake/confidence';
import type { Json } from '@/types/database';

export const dynamic = 'force-dynamic';

const SaveIntakeSchema = z.object({
  magic_token: z.string().min(6, 'Token pasien tidak valid'),
  red_flag_checklist: z.array(z.string()).default([]),
  has_red_flag: z.boolean().default(false),
  medications_json: z.array(z.record(z.unknown())).default([]),
  lab_results_json: z.array(z.record(z.unknown())).default([]),
  media_urls: z.array(z.string()).default([]),
  atm_timeline_json: z.record(z.unknown()).default({}),
  lifestyle_json: z.record(z.unknown()).default({}),
  autonomic_mindbody_json: z.record(z.unknown()).default({}),
  somatic_pain_map: z.record(z.unknown()).default({}),
  voice_transcript: z.string().optional().default(''),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = SaveIntakeSchema.parse(json);

    const admin = createAdminClient();

    // 1. Verify patient by magic_token
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, full_name, whatsapp')
      .eq('magic_token', payload.magic_token)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Token pasien tidak valid atau sesi telah kedaluwarsa.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Calculate Confidence Score
    const hasLayer2Basic = Boolean(
      Object.keys(payload.atm_timeline_json).length > 0 ||
      Object.keys(payload.lifestyle_json).length > 0 ||
      Object.keys(payload.somatic_pain_map).length > 0 ||
      payload.voice_transcript.length > 10
    );

    const hasMedicationsOrLabs = Boolean(
      payload.medications_json.length > 0 ||
      payload.lab_results_json.length > 0
    );

    const confidenceScore = calculateConfidenceScore({
      hasTriageData: true,
      hasLayer2Basic,
      hasMedicationsOrLabs,
      hasPractitionerVitals: false, // Practitioner layer 3 will add this later
    });

    // 3. Check for existing intake record
    const { data: existingIntake } = await admin
      .from('patient_intakes')
      .select('id, confidence_score')
      .eq('patient_id', patient.id)
      .maybeSingle();

    let intakeId: string;

    if (existingIntake) {
      intakeId = existingIntake.id;
      const { error: updateError } = await admin
        .from('patient_intakes')
        .update({
          red_flag_checklist: payload.red_flag_checklist as unknown as Json,
          has_red_flag: payload.has_red_flag || payload.red_flag_checklist.length > 0,
          medications_json: payload.medications_json as unknown as Json,
          lab_results_json: payload.lab_results_json as unknown as Json,
          media_urls: payload.media_urls as unknown as Json,
          atm_timeline_json: payload.atm_timeline_json as unknown as Json,
          lifestyle_json: payload.lifestyle_json as unknown as Json,
          autonomic_mindbody_json: payload.autonomic_mindbody_json as unknown as Json,
          somatic_pain_map: payload.somatic_pain_map as unknown as Json,
          voice_transcript: payload.voice_transcript,
          confidence_score: confidenceScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', intakeId);

      if (updateError) {
        console.error('[Save Intake API] Update error:', updateError);
        return NextResponse.json({ error: 'Gagal memperbarui data pra-pemeriksaan.' }, { status: 500 });
      }
    } else {
      const { data: newIntake, error: insertError } = await admin
        .from('patient_intakes')
        .insert({
          patient_id: patient.id,
          red_flag_checklist: payload.red_flag_checklist as unknown as Json,
          has_red_flag: payload.has_red_flag || payload.red_flag_checklist.length > 0,
          medications_json: payload.medications_json as unknown as Json,
          lab_results_json: payload.lab_results_json as unknown as Json,
          media_urls: payload.media_urls as unknown as Json,
          atm_timeline_json: payload.atm_timeline_json as unknown as Json,
          lifestyle_json: payload.lifestyle_json as unknown as Json,
          autonomic_mindbody_json: payload.autonomic_mindbody_json as unknown as Json,
          somatic_pain_map: payload.somatic_pain_map as unknown as Json,
          voice_transcript: payload.voice_transcript,
          confidence_score: confidenceScore,
        })
        .select('id')
        .single();

      if (insertError || !newIntake) {
        console.error('[Save Intake API] Insert error:', insertError);
        return NextResponse.json({ error: 'Gagal menyimpan data pra-pemeriksaan.' }, { status: 500 });
      }

      intakeId = newIntake.id;
    }

    return NextResponse.json({
      success: true,
      intake_id: intakeId,
      confidence_score: confidenceScore,
      has_red_flag: payload.has_red_flag || payload.red_flag_checklist.length > 0,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form pra-pemeriksaan gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Save Intake API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menyimpan data pra-pemeriksaan.' },
      { status: 500 }
    );
  }
}
