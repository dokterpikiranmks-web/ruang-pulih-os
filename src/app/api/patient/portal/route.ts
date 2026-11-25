import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyPatientSession } from '@/lib/patient/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token pasien wajib disertakan.' },
        { status: 400 }
      );
    }

    // Verify session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rp_patient_session')?.value;
    const isValidSession = verifyPatientSession(token, sessionCookie);

    if (!isValidSession) {
      return NextResponse.json(
        { error: 'Sesi tidak valid atau telah kedaluwarsa. Silakan masukkan PIN 4 digit Anda kembali.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    // 1. Fetch Patient
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, full_name, whatsapp, magic_token, created_at')
      .eq('magic_token', token)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Pasien tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Fetch Latest Appointment
    const { data: appointment } = await admin
      .from('appointments')
      .select('id, slot_start, slot_end, package_type, status, amount_paid_idr')
      .eq('patient_id', patient.id)
      .order('slot_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Fetch Clinical Protocol (HUMAN-IN-THE-LOOP RULE: ONLY return if PUBLISHED)
    const { data: rawProtocol } = await admin
      .from('clinical_protocols')
      .select('id, status, domain_scores_json, final_protocol_json, safety_audit_json, patient_friendly_summary, published_at')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const protocolRecord: any = rawProtocol;

    let protocolData;
    if (protocolRecord && protocolRecord.status === 'PUBLISHED') {
      protocolData = {
        status: 'PUBLISHED',
        domain_scores: protocolRecord.domain_scores_json,
        protocol_phases: protocolRecord.final_protocol_json,
        safety_audit: protocolRecord.safety_audit_json,
        summary: protocolRecord.patient_friendly_summary,
        published_at: protocolRecord.published_at,
      };
    } else {
      protocolData = {
        status: 'WAITING_REVIEW',
        message:
          'Protokol terapi mandiri Anda sedang disusun dan diverifikasi langsung oleh Praktisi Ruang Pulih Makassar. Notifikasi akan segera muncul begitu praktisi menyetujui program pemulihan Anda.',
      };
    }

    // 4. Fetch Progress Logs for recovery trends
    const { data: rawLogs } = await admin
      .from('progress_logs')
      .select('id, pain_score, sleep_score, stress_score, adherence_pct, patient_note, ai_adaptation_alert, logged_at')
      .eq('patient_id', patient.id)
      .order('logged_at', { ascending: true })
      .limit(30);

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        full_name: patient.full_name,
        magic_token: patient.magic_token,
      },
      appointment: appointment || null,
      protocol: protocolData,
      progress_logs: rawLogs || [],
    });
  } catch (err) {
    console.error('[Patient Portal API] Error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat mengambil data portal pasien.' },
      { status: 500 }
    );
  }
}
