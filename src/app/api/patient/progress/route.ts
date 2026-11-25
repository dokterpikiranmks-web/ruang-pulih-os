import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyPatientSession } from '@/lib/patient/auth';
import { runAgent7Monitor, type ProgressLogItem } from '@/lib/agents/agent7-monitor';

export const dynamic = 'force-dynamic';

const ProgressCheckInSchema = z.object({
  magic_token: z.string().min(6, 'Token pasien tidak valid'),
  pain_score: z.number().int().min(1).max(10),
  sleep_score: z.number().int().min(1).max(10),
  stress_score: z.number().int().min(1).max(10),
  adherence_pct: z.number().int().min(0).max(100).default(100),
  patient_note: z.string().max(500).optional().default(''),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = ProgressCheckInSchema.parse(json);

    // Verify session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rp_patient_session')?.value;
    const isValid = verifyPatientSession(payload.magic_token, sessionCookie);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Sesi tidak valid atau telah kedaluwarsa.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    // Fetch patient
    const { data: patient, error: patientErr } = await admin
      .from('patients')
      .select('id, full_name, magic_token')
      .eq('magic_token', payload.magic_token)
      .single();

    if (patientErr || !patient) {
      return NextResponse.json(
        { error: 'Data pasien tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Fetch historical progress logs
    const { data: rawHistory } = await admin
      .from('progress_logs')
      .select('pain_score, sleep_score, stress_score, adherence_pct, patient_note, logged_at')
      .eq('patient_id', patient.id)
      .order('logged_at', { ascending: true });

    const history: ProgressLogItem[] = (rawHistory || []).map((h) => ({
      pain_score: h.pain_score,
      sleep_score: h.sleep_score,
      stress_score: h.stress_score,
      adherence_pct: h.adherence_pct,
      patient_note: h.patient_note,
      logged_at: h.logged_at,
    }));

    // Run Agent 7 Monitor (Hybrid Rule Engine + Gemini Flash)
    const currentItem: ProgressLogItem = {
      pain_score: payload.pain_score,
      sleep_score: payload.sleep_score,
      stress_score: payload.stress_score,
      adherence_pct: payload.adherence_pct,
      patient_note: payload.patient_note,
      logged_at: new Date().toISOString(),
    };

    const adaptationResult = await runAgent7Monitor({
      currentLog: currentItem,
      history,
      patientName: patient.full_name,
    });

    // Save to progress_logs
    const { data: insertedLog, error: insertErr } = await admin
      .from('progress_logs')
      .insert({
        patient_id: patient.id,
        pain_score: payload.pain_score,
        sleep_score: payload.sleep_score,
        stress_score: payload.stress_score,
        adherence_pct: payload.adherence_pct,
        patient_note: payload.patient_note || null,
        ai_adaptation_alert: adaptationResult.alert_message || null,
        alert_acknowledged: false,
      })
      .select('id, logged_at')
      .single();

    if (insertErr) {
      console.error('[Progress Check-in API] Insert error:', insertErr);
      return NextResponse.json(
        { error: 'Gagal menyimpan check-in harian.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      log_id: insertedLog.id,
      logged_at: insertedLog.logged_at,
      adaptation_alert: adaptationResult.alert_message,
      alert_level: adaptationResult.alert_level,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Format data check-in tidak valid', details: err.errors },
        { status: 400 }
      );
    }
    console.error('[Progress Check-in API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menyimpan progres.' },
      { status: 500 }
    );
  }
}
