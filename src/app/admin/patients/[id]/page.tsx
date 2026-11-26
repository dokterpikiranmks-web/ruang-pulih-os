'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  FileText,
  Activity,
  Heart,
  Brain,
  ShieldCheck,
  Stethoscope,
  MessageSquare,
  Send,
  TrendingDown,
  ExternalLink,
  Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatWITADateTime, formatWITATime } from '@/lib/utils/timezone';
import type { ClinicalConsensusOutput } from '@/lib/agents/types';

interface ProgressLogRecord {
  id: string;
  pain_score: number;
  sleep_score: number;
  stress_score: number;
  adherence_pct: number;
  patient_note: string | null;
  ai_adaptation_alert: string | null;
  alert_acknowledged: boolean;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  blood_sugar_mgdl: number | null;
  blood_sugar_context: string | null;
  completed_habits_json: string[] | null;
  logged_at: string;
}

export default function PatientExaminationRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const patientId = resolvedParams.id;

  // Patient & Intake data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [patient, setPatient] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [intake, setIntake] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appointment, setAppointment] = useState<any>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(45);
  const [progressLogs, setProgressLogs] = useState<ProgressLogRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  // Layer 3 Practitioner Vitals
  const [bloodPressure, setBloodPressure] = useState('120/80');
  const [heartRate, setHeartRate] = useState(72);
  const [palpationFindings, setPalpationFindings] = useState('');
  const [practitionerNotes, setPractitionerNotes] = useState('');
  const [isSavingVitals, setIsSavingVitals] = useState(false);
  const [vitalsSavedNotice, setVitalsSavedNotice] = useState<string | null>(null);

  // AI Synthesis State
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [protocolOutput, setProtocolOutput] = useState<ClinicalConsensusOutput | null>(null);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [protocolStatus, setProtocolStatus] = useState<string>('DRAFT_REVIEW');

  // Editable summaries
  const [editablePractitionerSummary, setEditablePractitionerSummary] = useState('');
  const [editablePatientSummary, setEditablePatientSummary] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessNotice, setPublishSuccessNotice] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  const fetchPatientData = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();

    try {
      // 1. Fetch Patient
      const { data: pt } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      setPatient(pt);

      // 2. Fetch Intake
      const { data: rawItk } = await supabase
        .from('patient_intakes')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itk: any = rawItk;
      setIntake(itk);

      if (itk) {
        setConfidenceScore(itk.confidence_score || 78);
        const vitals = (itk.practitioner_vitals_json || {}) as Record<string, unknown>;
        if (vitals.blood_pressure) setBloodPressure(String(vitals.blood_pressure));
        if (vitals.heart_rate) setHeartRate(Number(vitals.heart_rate));
        if (vitals.palpation_findings) setPalpationFindings(String(vitals.palpation_findings));
        if (itk.practitioner_notes) setPractitionerNotes(itk.practitioner_notes);
      }

      // 3. Fetch Appointment & Triage
      const { data: appt } = await supabase
        .from('appointments')
        .select('*, leads_triage(*)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      setAppointment(appt);

      // 4. Fetch existing Protocol (if any)
      const { data: rawProt } = await supabase
        .from('clinical_protocols')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProt: any = rawProt;

      if (existingProt) {
        setProtocolId(existingProt.id);
        setProtocolStatus(existingProt.status);
        setEditablePractitionerSummary(existingProt.practitioner_summary || '');
        setEditablePatientSummary(existingProt.patient_friendly_summary || '');

        setProtocolOutput({
          status: existingProt.status,
          red_flag_detected: existingProt.red_flag_status,
          red_flag_action: existingProt.red_flag_message,
          confidence_score: itk?.confidence_score || 88,
          domain_scores: existingProt.domain_scores_json as unknown as ClinicalConsensusOutput['domain_scores'],
          root_cause_matrix: existingProt.agent_outputs_json as unknown as ClinicalConsensusOutput['root_cause_matrix'],
          safety_audit: existingProt.safety_audit_json as unknown as ClinicalConsensusOutput['safety_audit'],
          protocol_phases: existingProt.final_protocol_json as unknown as ClinicalConsensusOutput['protocol_phases'],
          practitioner_summary: existingProt.practitioner_summary || '',
          patient_friendly_summary: existingProt.patient_friendly_summary || '',
          meta: {
            loops_executed: existingProt.loops_executed || 1,
            model_used: 'gemini-flash-auto',
            total_cost_idr: 0,
          },
        });
      }

      // 5. Fetch Home Progress Logs
      const { data: pLogs } = await supabase
        .from('progress_logs')
        .select('*')
        .eq('patient_id', patientId)
        .order('logged_at', { ascending: false });
      setProgressLogs((pLogs || []) as ProgressLogRecord[]);
    } catch (err) {
      console.warn('[Examination Room] Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatientData();
  }, [fetchPatientData]);

  // Save Layer 3 Practitioner Vitals
  const handleSaveVitals = async () => {
    setIsSavingVitals(true);
    setVitalsSavedNotice(null);

    try {
      const res = await fetch('/api/admin/patients/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          blood_pressure: bloodPressure,
          heart_rate: heartRate,
          palpation_findings: palpationFindings,
          practitioner_notes: practitionerNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tanda vital.');

      setConfidenceScore(95);
      setVitalsSavedNotice('Pemeriksaan fisik Lapisan 3 tersimpan! Akurasi diagnosa naik ke 95%.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSavingVitals(false);
    }
  };

  // Run 6-Agent Clinical Consensus Engine
  const handleRunDewanPakar = async () => {
    setIsSynthesizing(true);
    setPublishSuccessNotice(null);

    try {
      const res = await fetch('/api/agents/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          intake_id: intake?.id || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menjalankan Dewan Pakar AI.');

      setProtocolId(data.protocol_id);
      setProtocolOutput(data.protocol);
      setProtocolStatus('DRAFT_REVIEW');
      setEditablePractitionerSummary(data.protocol.practitioner_summary);
      setEditablePatientSummary(data.protocol.patient_friendly_summary);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Publish Protocol to Patient App
  const handlePublishProtocol = async () => {
    if (!protocolId) return;
    setIsPublishing(true);

    try {
      const res = await fetch('/api/admin/protocols/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol_id: protocolId,
          practitioner_summary: editablePractitionerSummary,
          patient_friendly_summary: editablePatientSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menerbitkan protokol.');

      setProtocolStatus('PUBLISHED');
      setPublishSuccessNotice('Protokol resmi diterbitkan! Pasien sekarang dapat melihat protokol di portal mandiri.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsPublishing(false);
    }
  };

  const magicLinkUrl = patient?.magic_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${patient.magic_token}`
    : '';

  const pinLast4 = patient?.whatsapp ? patient.whatsapp.slice(-4) : '••••';
  const portalShareText = `Halo Bapak/Ibu ${patient?.full_name || ''}, berikut tautan akses ke Aplikasi Pasien Ruang Pulih Anda:
🔗 ${magicLinkUrl}

*(Gunakan 4 digit terakhir nomor WhatsApp Anda: **${pinLast4}** sebagai PIN masuk)*`;

  const handleCopyMagicLink = () => {
    if (portalShareText) {
      navigator.clipboard.writeText(portalShareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-klinik-bg">
        <Loader2 className="h-8 w-8 animate-spin text-klinik-gold" />
        <span className="ml-3 text-sm text-klinik-muted">Memuat rekam medis pasien...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-klinik-bg p-4 md:p-8 text-klinik-text">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-klinik-border pb-4">
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-klinik-primary hover:text-klinik-gold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Antrean Jadwal</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-klinik-muted">Akurasi Diagnosa:</span>
            <span className="rounded-full bg-klinik-primary px-3 py-1 text-xs font-bold text-white">
              {confidenceScore}%
            </span>
          </div>
        </div>

        {/* Patient Header Card */}
        <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-klinik-gold uppercase tracking-wider">
                Ruang Pemeriksaan Klinis & Dewan Pakar AI
              </span>
              <h1 className="text-xl font-black text-klinik-primary">
                {patient?.full_name} ({patient?.age || '-'} Tahun)
              </h1>
              <p className="text-xs text-klinik-muted">
                WhatsApp: {patient?.whatsapp} • Alamat: {patient?.address || '-'}
              </p>
            </div>

            {/* Magic Link Copy Button */}
            <button
              type="button"
              onClick={handleCopyMagicLink}
              className="inline-flex items-center gap-2 rounded-xl border border-klinik-border bg-gray-50 px-3.5 py-2 text-xs font-bold text-klinik-primary hover:bg-gray-100"
            >
              <Copy className="h-3.5 w-3.5 text-klinik-gold" />
              <span>{copiedLink ? 'Teks + PIN Tersalin!' : 'Salin Link Portal + Info PIN'}</span>
            </button>
          </div>

          {/* Confidence Meter Bar */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-linear-to-r from-emerald-600 to-klinik-gold transition-all duration-500"
                style={{ width: `${confidenceScore}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-klinik-muted font-medium">
              <span>Triage (45%)</span>
              <span>Intake Pasien (78% - 88%)</span>
              <span className="font-bold text-klinik-primary">Pemeriksaan Fisik Lapisan 3 (95%)</span>
            </div>
          </div>
        </div>

        {/* GRID: LEFT (Layer 1 & 2 Data) | RIGHT (Layer 3 Vitals & Action) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT: Data Pasien Lapisan 1 & 2 */}
          <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-klinik-primary flex items-center gap-2">
              <FileText className="h-4 w-4 text-klinik-gold" />
              <span>Data Triage & Pra-Pemeriksaan (Lapisan 1 & 2)</span>
            </h3>

            {/* Triage Summary */}
            <div className="rounded-xl bg-gray-50 p-3 text-xs space-y-1">
              <div><strong>Keluhan:</strong> {appointment?.leads_triage?.complaint_category || appointment?.notes || '-'}</div>
              <div><strong>Durasi:</strong> {appointment?.leads_triage?.duration || '-'}</div>
              <div><strong>Aktivitas Terganggu:</strong> {appointment?.leads_triage?.disrupted_activity || '-'}</div>
            </div>

            {/* Red Flag Status */}
            {intake?.has_red_flag && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <ShieldAlert className="h-4 w-4 inline mr-1 text-red-600" />
                <strong>Red Flag Terdeteksi:</strong> {JSON.stringify(intake.red_flag_checklist || [])}
              </div>
            )}

            {/* Detected Medications */}
            {intake?.medications_json && Array.isArray(intake.medications_json) && intake.medications_json.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-klinik-primary">Obat Resep / Herbal Terdeteksi:</div>
                <div className="space-y-1">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {intake.medications_json.map((m: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/70 p-2 text-xs">
                      <strong>{m.name}</strong> • {m.dosage} ({m.frequency})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Voice Story Transcript */}
            {intake?.voice_transcript && (
              <div className="rounded-xl border border-gray-100 bg-amber-50/30 p-3 text-xs">
                <div className="font-bold text-klinik-primary mb-1">Cerita Kronologi Pasien:</div>
                <p className="italic text-gray-700">{intake.voice_transcript}</p>
              </div>
            )}
          </div>

          {/* RIGHT: Layer 3 Practitioner Vitals & AI Trigger */}
          <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-klinik-primary flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-klinik-gold" />
              <span>Input Pemeriksaan Fisik Praktisi (Lapisan 3)</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold">Tekanan Darah (Tensi)</label>
                <input
                  type="text"
                  value={bloodPressure}
                  onChange={(e) => setBloodPressure(e.target.value)}
                  placeholder="120/80"
                  className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Denyut Nadi Istirahat</label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(parseInt(e.target.value, 10) || 72)}
                  placeholder="72"
                  className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold">Temuan Palpasi Fisik (Titik Kompresi/Spasme)</label>
              <textarea
                rows={2}
                value={palpationFindings}
                onChange={(e) => setPalpationFindings(e.target.value)}
                placeholder="Misal: Spasme keras m. piriformis kiri, tenderness di faset L4-L5, diafragma tegang..."
                className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold">Catatan Klinis Prioritas Praktisi</label>
              <textarea
                rows={2}
                value={practitionerNotes}
                onChange={(e) => setPractitionerNotes(e.target.value)}
                placeholder="Prioritas: redakan kompresi lumbal sebelum latihan mobilitas..."
                className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
              />
            </div>

            {vitalsSavedNotice && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                {vitalsSavedNotice}
              </div>
            )}

            <button
              type="button"
              disabled={isSavingVitals}
              onClick={handleSaveVitals}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-klinik-primary bg-white text-xs font-bold text-klinik-primary hover:bg-klinik-bg"
            >
              {isSavingVitals ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan Pemeriksaan Fisik (Lapisan 3)'}
            </button>

            {/* Run Dewan Pakar AI Button */}
            <div className="border-t border-gray-100 pt-3">
              <button
                type="button"
                disabled={isSynthesizing}
                onClick={handleRunDewanPakar}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-klinik-primary text-xs font-bold text-white shadow-md transition hover:bg-klinik-primaryLight active:scale-[0.99]"
              >
                {isSynthesizing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Dewan Pakar AI Sedang Bersidang...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-klinik-gold" />
                    <span>Jalankan Dewan Pakar AI (6 Agen)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION: PANTAUAN PROGRES & KEPATUHAN DI RUMAH                       */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-klinik-primary" />
                <h3 className="text-base font-bold text-klinik-primary">
                  Pantauan Progres & Kepatuhan di Rumah
                </h3>
              </div>
              <p className="text-xs text-klinik-muted mt-0.5">
                Data check-in mandiri pasien, tren nyeri, riwayat tensi, gula darah, & kepatuhan habit rumah
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 self-start sm:self-auto">
              {progressLogs.length} Check-In Tercatat
            </span>
          </div>

          {/* Adaptation Alert Card with 1-Click WhatsApp Follow-up */}
          {(() => {
            const activeAlertLog = progressLogs.find((l) => l.ai_adaptation_alert);
            if (!activeAlertLog || !activeAlertLog.ai_adaptation_alert) return null;

            const isRed = activeAlertLog.ai_adaptation_alert.includes('RED');
            const waPhone = patient?.whatsapp ? patient.whatsapp.replace(/\D/g, '') : '';
            const followUpMsg = `Halo Bapak/Ibu ${patient?.full_name || ''}, kami dari Ruang Pulih Makassar ingin menanyakan kabar dan perkembangan kondisi tubuh Anda setelah check-in mandiri kemarin. Apakah saat ini rasa nyeri atau kondisi tensi/tubuh Anda sudah terasa lebih nyaman?`;
            const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(followUpMsg)}`;

            return (
              <div
                className={`rounded-xl border p-4 text-xs space-y-2.5 ${
                  isRed
                    ? 'border-red-300 bg-red-50 text-red-950'
                    : 'border-amber-300 bg-amber-50 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldAlert className={`h-4 w-4 ${isRed ? 'text-red-600' : 'text-amber-600'}`} />
                    <span className={isRed ? 'text-red-800 font-extrabold' : 'text-amber-900 font-bold'}>
                      {isRed ? 'Peringatan Darurat Adaptasi Klinis (RED)' : 'Perhatian Evaluasi Adaptasi (YELLOW)'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {formatWITADateTime(activeAlertLog.logged_at)}
                  </span>
                </div>
                <p className="leading-relaxed font-medium">
                  {activeAlertLog.ai_adaptation_alert}
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-2xs transition ${
                      isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Follow-Up Pasien via WhatsApp (1-Klik)</span>
                  </a>
                </div>
              </div>
            );
          })()}

          {/* SVG Recovery Trends Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-klinik-primary" />
                <span>Grafik Tren Pemulihan (Nyeri, Tidur, & Kepatuhan)</span>
              </h4>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1 text-emerald-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0D3B2E]" /> Nyeri (1-10)
                </span>
                <span className="flex items-center gap-1 text-blue-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" /> Tidur (1-10)
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" /> Kepatuhan (%)
                </span>
              </div>
            </div>

            {progressLogs.length < 2 ? (
              <div className="rounded-xl bg-gray-50 p-6 text-center text-xs text-gray-400">
                Belum cukup data untuk membentuk grafik tren (minimal 2 kali check-in dari pasien).
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 overflow-x-auto">
                <svg viewBox="0 0 500 150" className="w-full h-36">
                  {/* Grid lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="65" x2="480" y2="65" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="110" x2="480" y2="110" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />

                  <text x="10" y="24" fill="#94a3b8" fontSize="10" fontWeight="bold">10 / 100%</text>
                  <text x="18" y="69" fill="#94a3b8" fontSize="10">5 / 50%</text>
                  <text x="18" y="114" fill="#94a3b8" fontSize="10">1 / 10%</text>

                  {(() => {
                    const chartData = [...progressLogs].reverse().slice(-10);
                    const total = chartData.length;
                    const stepX = 420 / Math.max(1, total - 1);

                    const painPoints = chartData.map((d, i) => ({
                      x: 50 + i * stepX,
                      y: 110 - ((d.pain_score - 1) / 9) * 90,
                      val: d.pain_score,
                    }));

                    const sleepPoints = chartData.map((d, i) => ({
                      x: 50 + i * stepX,
                      y: 110 - ((d.sleep_score - 1) / 9) * 90,
                      val: d.sleep_score,
                    }));

                    const adhPoints = chartData.map((d, i) => ({
                      x: 50 + i * stepX,
                      y: 110 - ((d.adherence_pct || 0) / 100) * 90,
                      val: d.adherence_pct,
                    }));

                    const makePath = (pts: { x: number; y: number }[]) =>
                      pts.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

                    return (
                      <>
                        {/* Pain line */}
                        <path d={makePath(painPoints)} fill="none" stroke="#0D3B2E" strokeWidth="2.5" />
                        {painPoints.map((p, i) => (
                          <circle key={`pain-${i}`} cx={p.x} cy={p.y} r="4" fill="#0D3B2E" />
                        ))}

                        {/* Sleep line */}
                        <path d={makePath(sleepPoints)} fill="none" stroke="#2563EB" strokeWidth="2" strokeDasharray="4 2" />
                        {sleepPoints.map((p, i) => (
                          <circle key={`sleep-${i}`} cx={p.x} cy={p.y} r="3" fill="#2563EB" />
                        ))}

                        {/* Adherence line */}
                        <path d={makePath(adhPoints)} fill="none" stroke="#D4AF37" strokeWidth="2" />
                        {adhPoints.map((p, i) => (
                          <circle key={`adh-${i}`} cx={p.x} cy={p.y} r="3" fill="#D4AF37" />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>

          {/* Table: Riwayat Tensi, Gula Darah, & Catatan Pasien */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Tabel Riwayat Pengukuran Mandiri & Catatan Pasien
            </h4>

            {progressLogs.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-6 text-center text-xs text-gray-400">
                Belum ada riwayat check-in dari pasien ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 uppercase font-bold text-[10px]">
                      <th className="py-2.5 px-3">Waktu (WITA)</th>
                      <th className="py-2.5 px-3">Tensi (mmHg)</th>
                      <th className="py-2.5 px-3">Gula Darah</th>
                      <th className="py-2.5 px-3">Nyeri / Tidur / Stres</th>
                      <th className="py-2.5 px-3">Kepatuhan</th>
                      <th className="py-2.5 px-3">Catatan Pasien</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                    {progressLogs.map((log) => {
                      const isBpRed =
                        (log.systolic_bp && log.systolic_bp >= 180) ||
                        (log.diastolic_bp && log.diastolic_bp >= 120);
                      const isBpYellow = !isBpRed && log.systolic_bp && log.systolic_bp >= 150;

                      const isBsRed =
                        log.blood_sugar_mgdl &&
                        (log.blood_sugar_mgdl < 70 || log.blood_sugar_mgdl >= 300);
                      const isBsYellow =
                        !isBsRed && log.blood_sugar_mgdl && log.blood_sugar_mgdl >= 200;

                      return (
                        <tr key={log.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-gray-900">
                              {new Date(log.logged_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="block text-[10px] text-gray-400 font-mono">
                              {formatWITATime(log.logged_at)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {log.systolic_bp ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                                  isBpRed
                                    ? 'bg-red-100 text-red-800 border border-red-300'
                                    : isBpYellow
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800'
                                }`}
                              >
                                {log.systolic_bp}/{log.diastolic_bp || '-'}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {log.blood_sugar_mgdl ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                                  isBsRed
                                    ? 'bg-red-100 text-red-800 border border-red-300'
                                    : isBsYellow
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-blue-50 text-blue-800'
                                }`}
                              >
                                {log.blood_sugar_mgdl} mg/dL
                                {log.blood_sugar_context && (
                                  <span className="text-[9px] font-normal block opacity-80">
                                    {log.blood_sugar_context}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono text-xs">
                              <strong className="text-emerald-800">{log.pain_score}</strong> /{' '}
                              <span className="text-blue-700">{log.sleep_score}</span> /{' '}
                              <span className="text-purple-700">{log.stress_score}</span>
                            </span>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-bold font-mono text-[11px] text-gray-700">
                              {log.adherence_pct}%
                            </span>
                          </td>

                          <td className="py-2.5 px-3 max-w-xs text-xs text-gray-600 truncate" title={log.patient_note || ''}>
                            {log.patient_note || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RESULTS: DEWAN PAKAR AI CONSENSUS OUTPUT */}
        {protocolOutput && (
          <div className="rounded-2xl border-2 border-klinik-gold/40 bg-white p-6 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-klinik-gold uppercase tracking-wider">
                  Hasil Konsensus Dewan Pakar AI
                </span>
                <h2 className="text-lg font-black text-klinik-primary">
                  Draft Protokol Terapi Integratif
                </h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  protocolStatus === 'PUBLISHED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                Status: {protocolStatus}
              </span>
            </div>

            {/* 4 Health Domain Scores */}
            <div>
              <h4 className="text-xs font-bold text-klinik-primary uppercase tracking-wider mb-3">
                4 Skor Domain Kesehatan Awal (0 - 100)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <Brain className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-500 block">Saraf Otonom</span>
                  <div className="text-lg font-black text-klinik-primary">
                    {protocolOutput.domain_scores?.nervous_autonomic || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <Activity className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-500 block">Metabolik & Usus</span>
                  <div className="text-lg font-black text-klinik-primary">
                    {protocolOutput.domain_scores?.metabolic_gut || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <Heart className="h-4 w-4 text-purple-600 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-500 block">Pemulihan Tidur</span>
                  <div className="text-lg font-black text-klinik-primary">
                    {protocolOutput.domain_scores?.recovery_sleep || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <AlertCircle className="h-4 w-4 text-amber-600 mx-auto mb-1" />
                  <span className="text-[10px] text-gray-500 block">Beban Emosional</span>
                  <div className="text-lg font-black text-klinik-primary">
                    {protocolOutput.domain_scores?.emotional_stress || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Safety Traffic Light Audit */}
            <div>
              <h4 className="text-xs font-bold text-klinik-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Audit Keamanan Farmakologi (Agent 5 Safety)</span>
              </h4>
              <div className="space-y-2">
                {protocolOutput.safety_audit?.map((audit, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 text-xs flex items-start gap-3 ${
                      audit.traffic_light === 'RED'
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : audit.traffic_light === 'YELLOW'
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    }`}
                  >
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                        audit.traffic_light === 'RED'
                          ? 'bg-red-600 text-white'
                          : audit.traffic_light === 'YELLOW'
                          ? 'bg-amber-600 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {audit.traffic_light}
                    </span>
                    <div>
                      <strong>{audit.item}</strong>: {audit.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3-Phase Protocols */}
            <div>
              <h4 className="text-xs font-bold text-klinik-primary uppercase tracking-wider mb-2">
                Rancangan 3 Fase Terapi & Home Care
              </h4>
              <div className="space-y-3">
                {protocolOutput.protocol_phases?.map((phase) => (
                  <div key={phase.phase} className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-klinik-primary text-sm">
                        {phase.title}
                      </span>
                      <span className="rounded-full bg-klinik-gold/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                        {phase.evidence_tier}
                      </span>
                    </div>
                    <div>
                      <strong>Terapi Klinik:</strong> {phase.clinic_therapy}
                    </div>
                    <div>
                      <strong>Perawatan Mandiri di Rumah:</strong>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 text-gray-700">
                        {phase.home_care?.map((hc, i) => (
                          <li key={i}>{hc}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Editable Summaries */}
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs font-bold text-klinik-primary block">
                  Ringkasan Teknis Klinis (Praktisi)
                </label>
                <textarea
                  rows={3}
                  value={editablePractitionerSummary}
                  onChange={(e) => setEditablePractitionerSummary(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-klinik-border p-3 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-klinik-primary block">
                  Ringkasan Bahasa Awam untuk Pasien (PWA Portal)
                </label>
                <textarea
                  rows={3}
                  value={editablePatientSummary}
                  onChange={(e) => setEditablePatientSummary(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-klinik-border p-3 text-xs"
                />
              </div>
            </div>

            {/* Publish Success Notice */}
            {publishSuccessNotice && (
              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 font-semibold">
                {publishSuccessNotice}
              </div>
            )}

            {/* Publish Action Button */}
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublishProtocol}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.99]"
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Setujui & Terbitkan ke Aplikasi Pasien (PUBLISHED)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
