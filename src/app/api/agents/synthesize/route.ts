import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { runClinicalOrchestrator } from '@/lib/agents/orchestrator';
import type { PatientContext } from '@/lib/agents/agent0-gatekeeper';

export const dynamic = 'force-dynamic';

const SynthesizeRequestSchema = z.object({
  patient_id: z.string().uuid('ID Pasien tidak valid'),
  intake_id: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = SynthesizeRequestSchema.parse(json);

    const admin = createAdminClient();

    // 1. Fetch patient profile
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, full_name, age, whatsapp, address, magic_token, pin_last4')
      .eq('id', payload.patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Data pasien tidak ditemukan.', code: 'PATIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 2. Fetch intake data (if available)
    let intakeQuery = admin
      .from('patient_intakes')
      .select('*')
      .eq('patient_id', payload.patient_id);

    if (payload.intake_id) {
      intakeQuery = intakeQuery.eq('id', payload.intake_id);
    }

    const { data: intake } = await intakeQuery.order('created_at', { ascending: false }).maybeSingle();

    // 3. Fetch latest appointment & lead triage data (if available)
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, lead_id, package_type, notes, leads_triage(*)')
      .eq('patient_id', payload.patient_id)
      .order('created_at', { ascending: false })
      .maybeSingle();

    const lead = appointment?.leads_triage as unknown as {
      complaint_category?: string;
      duration?: string;
      disrupted_activity?: string;
    } | null;

    // 4. Construct PatientContext
    const ctx: PatientContext = {
      full_name: patient.full_name,
      age: patient.age,
      complaint_category: lead?.complaint_category || appointment?.notes || 'Keluhan umum',
      duration: lead?.duration || 'Beberapa bulan',
      disrupted_activity: lead?.disrupted_activity || 'Aktivitas harian',
      red_flag_checklist: (intake?.red_flag_checklist as string[]) || [],
      has_red_flag: intake?.has_red_flag || false,
      medications_json: (intake?.medications_json as unknown[]) || [],
      lab_results_json: (intake?.lab_results_json as unknown[]) || [],
      atm_timeline_json: (intake?.atm_timeline_json as Record<string, unknown>) || {},
      lifestyle_json: (intake?.lifestyle_json as Record<string, unknown>) || {},
      autonomic_mindbody_json: (intake?.autonomic_mindbody_json as Record<string, unknown>) || {},
      somatic_pain_map: (intake?.somatic_pain_map as Record<string, unknown>) || {},
      voice_transcript: intake?.voice_transcript || '',
      practitioner_vitals_json: (intake?.practitioner_vitals_json as Record<string, unknown>) || {},
      practitioner_notes: intake?.practitioner_notes || '',
    };

    const confidenceScore = intake?.confidence_score || 78;

    // 5. Run 6-Agent Clinical Orchestrator
    const consensusOutput = await runClinicalOrchestrator(ctx, {
      confidence_score: confidenceScore,
    });

    // 6. Save result to clinical_protocols table with status = 'DRAFT_REVIEW'
    const { data: savedProtocol, error: saveError } = await admin
      .from('clinical_protocols')
      .insert({
        patient_id: payload.patient_id,
        intake_id: intake?.id || null,
        red_flag_status: consensusOutput.red_flag_detected,
        red_flag_message: consensusOutput.red_flag_action,
        domain_scores_json: consensusOutput.domain_scores,
        agent_outputs_json: consensusOutput.root_cause_matrix,
        safety_audit_json: consensusOutput.safety_audit,
        final_protocol_json: consensusOutput.protocol_phases,
        practitioner_summary: consensusOutput.practitioner_summary,
        patient_friendly_summary: consensusOutput.patient_friendly_summary,
        loops_executed: consensusOutput.meta.loops_executed,
        status: 'DRAFT_REVIEW',
      })
      .select('id, status, created_at')
      .single();

    if (saveError) {
      console.error('[Synthesize API] Failed to save protocol:', saveError);
    }

    return NextResponse.json({
      success: true,
      protocol_id: savedProtocol?.id || null,
      protocol: consensusOutput,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validasi form gagal', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Synthesize API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menjalankan Dewan Pakar AI.' },
      { status: 500 }
    );
  }
}
