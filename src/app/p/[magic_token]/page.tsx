'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  Heart,
  Brain,
  ShieldCheck,
  Activity,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  ArrowRight,
  TrendingDown,
  PhoneCall,
  Loader2,
  FileText,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { formatWITADateTime, formatWITATime } from '@/lib/utils/timezone';

interface DomainScores {
  nervous_autonomic?: number;
  metabolic_gut?: number;
  recovery_sleep?: number;
  emotional_stress?: number;
}

interface ProtocolPhase {
  phase: number;
  title: string;
  clinic_therapy: string;
  home_care: string[];
  evidence_tier: string;
}

interface SafetyAuditItem {
  item: string;
  traffic_light: 'GREEN' | 'YELLOW' | 'RED';
  reason: string;
}

interface ProgressLog {
  id: string;
  pain_score: number;
  sleep_score: number;
  stress_score: number;
  adherence_pct: number;
  patient_note: string | null;
  ai_adaptation_alert: string | null;
  logged_at: string;
}

export default function PatientPortalPage({
  params,
}: {
  params: Promise<{ magic_token: string }>;
}) {
  const resolvedParams = use(params);
  const magicToken = resolvedParams.magic_token;

  // PIN Lock State
  const [isLocked, setIsLocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Portal Data State
  const [isLoading, setIsLoading] = useState(false);
  const [patientData, setPatientData] = useState<{ id: string; full_name: string; magic_token: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appointment, setAppointment] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [protocol, setProtocol] = useState<any>(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'ROOT_CAUSE' | 'PROGRESS' | 'PROTOCOL' | 'APPOINTMENT'>('ROOT_CAUSE');

  // Check-In Form State
  const [painScore, setPainScore] = useState(5);
  const [sleepScore, setSleepScore] = useState(6);
  const [stressScore, setStressScore] = useState(5);
  const [adherencePct, setAdherencePct] = useState(100);
  const [patientNote, setPatientNote] = useState('');
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState<string | null>(null);

  // Home Care Checklist
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});

  // Fetch Portal Data
  const fetchPortalData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/patient/portal?token=${magicToken}`);
      if (res.status === 401) {
        setIsLocked(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPatientData(data.patient);
        setAppointment(data.appointment);
        setProtocol(data.protocol);
        setProgressLogs(data.progress_logs || []);
        setIsLocked(false);
      } else {
        setIsLocked(true);
      }
    } catch (err) {
      console.warn('[Patient Portal] Fetch failed:', err);
      setIsLocked(true);
    } finally {
      setIsLoading(false);
    }
  }, [magicToken]);

  // Initial load check
  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  // Handle PIN Submission
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length !== 4) {
      setPinError('Masukkan 4 digit terakhir nomor WhatsApp Anda.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const res = await fetch('/api/patient/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          magic_token: magicToken,
          pin_last4: pinInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsLocked(false);
        setPatientData(data.patient);
        await fetchPortalData();
      } else {
        setPinError(data.error || 'PIN 4 digit tidak cocok.');
      }
    } catch {
      setPinError('Gagal menghubungi server. Periksa koneksi internet Anda.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Handle Progress Check-In Submit
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCheckIn(true);
    setCheckInSuccessMsg(null);

    try {
      const res = await fetch('/api/patient/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          magic_token: magicToken,
          pain_score: painScore,
          sleep_score: sleepScore,
          stress_score: stressScore,
          adherence_pct: adherencePct,
          patient_note: patientNote,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCheckInSuccessMsg('Check-in berhasil disimpan! Terima kasih sudah memantau pemulihan Anda.');
        setPatientNote('');
        await fetchPortalData();
      } else {
        alert(data.error || 'Gagal menyimpan check-in.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan saat menyimpan check-in.');
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  // ---------------------------------------------------------------------------
  // VIEW: PIN LOCK SCREEN
  // ---------------------------------------------------------------------------
  if (isLocked) {
    return (
      <div className="min-h-screen bg-klinik-bg flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-xl border border-gray-100 text-center">
          <div className="w-16 h-16 bg-klinik-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-klinik-primary">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold text-klinik-primary font-serif mb-2">
            Portal Pasien
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Demi keamanan data medis pribadi Anda, masukkan <strong>4 digit terakhir nomor WhatsApp</strong> Anda untuk membuka aplikasi:
          </p>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • •"
                className="w-48 text-center text-3xl font-mono tracking-widest py-3 border-2 border-gray-200 rounded-2xl focus:border-klinik-gold focus:ring-2 focus:ring-klinik-gold/30 outline-none"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="text-sm text-red-600 bg-red-50 p-2.5 rounded-xl font-medium">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              disabled={isVerifyingPin || pinInput.length !== 4}
              className="w-full py-3.5 bg-klinik-primary hover:bg-klinik-primary/95 text-white font-semibold rounded-2xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isVerifyingPin ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Buka Aplikasi Pasien</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 text-xs text-gray-400">
            Klinik Ruang Pulih Makassar • Jl. Batua Raya 10B No. 9
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: MAIN PWA PORTAL
  // ---------------------------------------------------------------------------
  const domainScores: DomainScores = protocol?.domain_scores || {};
  const protocolPhases: ProtocolPhase[] = protocol?.protocol_phases || [];
  const safetyAudit: SafetyAuditItem[] = protocol?.safety_audit || [];

  return (
    <div className="min-h-screen bg-klinik-bg pb-24">
      {/* Top App Header */}
      <header className="bg-klinik-primary text-white px-5 pt-7 pb-6 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-klinik-gold/20 text-klinik-gold px-2.5 py-0.5 rounded-full font-medium">
                Aplikasi Pasien
              </span>
            </div>
            <h1 className="text-xl font-bold font-serif">
              Halo, {patientData?.full_name?.split(' ')[0] || 'Bapak/Ibu'}
            </h1>
            <p className="text-xs text-gray-300">Ruang Pulih • Makassar</p>
          </div>

          <button
            onClick={() => setIsLocked(true)}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white/80 transition-colors"
            title="Kunci Aplikasi"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="grid grid-cols-4 bg-white/80 backdrop-blur p-1 rounded-2xl shadow-sm border border-gray-200/60 text-xs font-semibold text-gray-500">
          <button
            onClick={() => setActiveTab('ROOT_CAUSE')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'ROOT_CAUSE'
                ? 'bg-klinik-primary text-white shadow-sm'
                : 'hover:text-klinik-primary'
            }`}
          >
            Akar Masalah
          </button>
          <button
            onClick={() => setActiveTab('PROGRESS')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'PROGRESS'
                ? 'bg-klinik-primary text-white shadow-sm'
                : 'hover:text-klinik-primary'
            }`}
          >
            Progres
          </button>
          <button
            onClick={() => setActiveTab('PROTOCOL')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'PROTOCOL'
                ? 'bg-klinik-primary text-white shadow-sm'
                : 'hover:text-klinik-primary'
            }`}
          >
            Protokol
          </button>
          <button
            onClick={() => setActiveTab('APPOINTMENT')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'APPOINTMENT'
                ? 'bg-klinik-primary text-white shadow-sm'
                : 'hover:text-klinik-primary'
            }`}
          >
            Sesi & Jadwal
          </button>
        </div>
      </div>

      {/* Content Container */}
      <main className="max-w-lg mx-auto px-4 mt-4 space-y-4">
        {/* =================================================================== */}
        {/* TAB 1: AKAR MASALAH & 4 DOMAIN                                      */}
        {/* =================================================================== */}
        {activeTab === 'ROOT_CAUSE' && (
          <div className="space-y-4">
            {protocol?.status === 'WAITING_REVIEW' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center">
                <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-700">
                  <Clock className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-amber-900 font-serif text-lg mb-2">
                  Protokol Sedang Diverifikasi
                </h3>
                <p className="text-sm text-amber-800 leading-relaxed">
                  {protocol.message}
                </p>
                <div className="mt-4 pt-4 border-t border-amber-200/60 text-xs text-amber-700">
                  Konsultasi langsung praktisi: <strong>0811443327</strong>
                </div>
              </div>
            ) : (
              <>
                {/* 4 Domain Health Scores */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-klinik-gold" />
                    <h2 className="font-bold text-klinik-primary font-serif">
                      4 Skor Domain Kesehatan Tubuh
                    </h2>
                  </div>

                  <div className="space-y-3.5">
                    {/* Domain 1: Nervous */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-klinik-primary" />
                          Saraf & Otonom
                        </span>
                        <span>{domainScores.nervous_autonomic ?? 50}/100</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-klinik-primary h-full rounded-full transition-all duration-700"
                          style={{ width: `${domainScores.nervous_autonomic ?? 50}%` }}
                        />
                      </div>
                    </div>

                    {/* Domain 2: Metabolic */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-600" />
                          Usus & Metabolisme
                        </span>
                        <span>{domainScores.metabolic_gut ?? 50}/100</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${domainScores.metabolic_gut ?? 50}%` }}
                        />
                      </div>
                    </div>

                    {/* Domain 3: Sleep */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          Pemulihan Tidur
                        </span>
                        <span>{domainScores.recovery_sleep ?? 50}/100</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${domainScores.recovery_sleep ?? 50}%` }}
                        />
                      </div>
                    </div>

                    {/* Domain 4: Emotional Stress */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-purple-600" />
                          Stres & Emosional
                        </span>
                        <span>{domainScores.emotional_stress ?? 50}/100</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-600 h-full rounded-full transition-all duration-700"
                          style={{ width: `${domainScores.emotional_stress ?? 50}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Patient Plain-Language Explanation */}
                {protocol?.summary && (
                  <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                    <h3 className="font-bold text-klinik-primary font-serif mb-2 text-base">
                      Penjelasan Akar Masalah Tubuh Anda
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {protocol.summary}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: PROGRES PEMULIHAN & CHECK-IN 30 DETIK                        */}
        {/* =================================================================== */}
        {activeTab === 'PROGRESS' && (
          <div className="space-y-4">
            {/* SVG Trend Chart */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-klinik-primary" />
                  <h3 className="font-bold text-klinik-primary font-serif">
                    Grafik Tren Penurunan Nyeri
                  </h3>
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-medium">
                  {progressLogs.length} Log Tercatat
                </span>
              </div>

              {progressLogs.length < 2 ? (
                <div className="text-center py-6 bg-gray-50 rounded-2xl text-xs text-gray-500">
                  Lakukan check-in minimal 2 hari untuk melihat grafik tren pemulihan tubuh Anda.
                </div>
              ) : (
                <div className="w-full overflow-x-auto py-2">
                  {/* Pure SVG Line Chart (Zero External Dependency) */}
                  <svg viewBox="0 0 360 140" className="w-full h-36">
                    {/* Grid Lines */}
                    <line x1="30" y1="20" x2="350" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="30" y1="60" x2="350" y2="60" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="30" y1="100" x2="350" y2="100" stroke="#f1f5f9" strokeWidth="1" />

                    <text x="5" y="24" fill="#94a3b8" fontSize="10">10</text>
                    <text x="12" y="64" fill="#94a3b8" fontSize="10">5</text>
                    <text x="12" y="104" fill="#94a3b8" fontSize="10">1</text>

                    {/* Chart Points Calculation */}
                    {(() => {
                      const points = progressLogs.slice(-7).map((log, index, arr) => {
                        const x = 40 + (index * (300 / Math.max(1, arr.length - 1)));
                        // pain 1..10 maps to y 100..20
                        const y = 100 - ((log.pain_score - 1) / 9) * 80;
                        return { x, y, pain: log.pain_score };
                      });

                      const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

                      return (
                        <>
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#0D3B2E"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {points.map((p, i) => (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r="5" fill="#D4AF37" stroke="#0D3B2E" strokeWidth="2" />
                              <text x={p.x - 4} y={p.y - 8} fill="#0D3B2E" fontSize="10" fontWeight="bold">
                                {p.pain}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>

            {/* Check-In 30 Detik Form */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-bold text-klinik-primary font-serif mb-1 text-base">
                Form Check-In Pemulihan 30 Detik
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Catat respon tubuh Anda secara rutin untuk membantu praktisi memantau adaptasi terapi.
              </p>

              {checkInSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 rounded-2xl mb-4 font-medium flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{checkInSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleCheckInSubmit} className="space-y-4">
                {/* 1. Pain Score Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-700">
                      Tingkat Nyeri Hari Ini (1–10)
                    </label>
                    <span className="text-sm font-bold text-klinik-primary font-mono bg-klinik-primary/10 px-2 py-0.5 rounded-lg">
                      {painScore} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={painScore}
                    onChange={(e) => setPainScore(Number(e.target.value))}
                    className="w-full accent-klinik-primary h-2 bg-gray-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>1 (Sangat Nyaman)</span>
                    <span>5 (Sedang)</span>
                    <span>10 (Sangat Nyeri)</span>
                  </div>
                </div>

                {/* 2. Sleep Quality Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-700">
                      Kenyamanan Tidur Semalam (1–10)
                    </label>
                    <span className="text-sm font-bold text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded-lg">
                      {sleepScore} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={sleepScore}
                    onChange={(e) => setSleepScore(Number(e.target.value))}
                    className="w-full accent-blue-600 h-2 bg-gray-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 3. Stress Score Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-700">
                      Beban Stres & Pikiran (1–10)
                    </label>
                    <span className="text-sm font-bold text-purple-600 font-mono bg-purple-50 px-2 py-0.5 rounded-lg">
                      {stressScore} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={stressScore}
                    onChange={(e) => setStressScore(Number(e.target.value))}
                    className="w-full accent-purple-600 h-2 bg-gray-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 4. Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Catatan Tubuh / Perubahan Rasa (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={patientNote}
                    onChange={(e) => setPatientNote(e.target.value)}
                    placeholder="Contoh: Pinggang lebih enteng, tapi masih agak ngilu saat bangun pagi..."
                    className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:border-klinik-primary outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingCheckIn}
                  className="w-full py-3 bg-klinik-primary hover:bg-klinik-primary/95 text-white text-xs font-bold rounded-2xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingCheckIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Progres...</span>
                    </>
                  ) : (
                    <span>Simpan Check-In Hari Ini</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: PROTOKOL RUMAH & KEAMANAN                                   */}
        {/* =================================================================== */}
        {activeTab === 'PROTOCOL' && (
          <div className="space-y-4">
            {/* Mandatory Rx Medication Safety Guardrail */}
            <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-4.5 text-xs text-red-900 leading-relaxed shadow-sm">
              <div className="flex items-center gap-2 font-bold mb-1 text-red-800">
                <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                <span>PANDUAN KESELAMATAN OBAT DOKTER</span>
              </div>
              Pasien <strong>DILARANG KERAS</strong> menghentikan, mengurangi, atau mengubah dosis obat resep dokter secara mendadak. Terapi di Ruang Pulih Makassar bersifat komplementer pendamping (integratif), bukan pengganti obat medis esensial.
            </div>

            {/* Safety Traffic Lights */}
            {safetyAudit.length > 0 && (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-bold text-klinik-primary font-serif mb-3 text-sm">
                  Audit Keamanan Tindakan Mandiri
                </h3>
                <div className="space-y-2.5">
                  {safetyAudit.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl text-xs border ${
                        item.traffic_light === 'RED'
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : item.traffic_light === 'YELLOW'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-0.5">
                        <span>{item.item}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            item.traffic_light === 'RED'
                              ? 'bg-red-600 text-white'
                              : item.traffic_light === 'YELLOW'
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {item.traffic_light}
                        </span>
                      </div>
                      <p className="opacity-90">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Home Care Interactive Checklist */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-bold text-klinik-primary font-serif mb-2 text-sm">
                Checklist Panduan Mandiri di Rumah
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Centang setiap panduan yang telah Anda laksanakan hari ini:
              </p>

              {protocolPhases.length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  Panduan rumah akan tampil setelah praktisi menyetujui protokol Anda.
                </p>
              ) : (
                <div className="space-y-4">
                  {protocolPhases.map((phase) => (
                    <div key={phase.phase} className="border border-gray-100 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-klinik-primary font-serif">
                          Fase {phase.phase}: {phase.title}
                        </span>
                        <span className="text-[10px] bg-klinik-gold/15 text-klinik-primary font-bold px-2 py-0.5 rounded-full">
                          {phase.evidence_tier}
                        </span>
                      </div>

                      <div className="space-y-2 mt-3">
                        {phase.home_care.map((item, idx) => {
                          const key = `${phase.phase}-${idx}`;
                          const isDone = !!completedItems[key];
                          return (
                            <label
                              key={idx}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl text-xs cursor-pointer transition-colors ${
                                isDone ? 'bg-emerald-50/70 text-emerald-900' : 'bg-gray-50 text-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() =>
                                  setCompletedItems((prev) => ({ ...prev, [key]: !isDone }))
                                }
                                className="mt-0.5 rounded text-klinik-primary accent-klinik-primary w-4 h-4"
                              />
                              <span className={isDone ? 'line-through opacity-70' : ''}>
                                {item}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: SESI & JADWAL BOOKING ULANG                                  */}
        {/* =================================================================== */}
        {activeTab === 'APPOINTMENT' && (
          <div className="space-y-4">
            {/* Active Appointment Card */}
            {appointment ? (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs bg-klinik-primary/10 text-klinik-primary font-bold px-2.5 py-0.5 rounded-full">
                    Tiket Sesi Aktif
                  </span>
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    {appointment.status}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs text-gray-700 mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-klinik-gold" />
                    <span>{formatWITADateTime(appointment.slot_start)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-klinik-gold shrink-0" />
                      <span>Jl. Batua Raya 10B No. 9, Makassar</span>
                    </div>
                    <a
                      href={process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL || 'https://maps.google.com/?q=Ruang+Pulih+Makassar'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-klinik-primary hover:text-klinik-gold underline shrink-0 flex items-center gap-1"
                    >
                      <span>Buka Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <Link
                  href={`/reschedule/${appointment.id}`}
                  className="w-full py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                  <span>Pindah Jadwal (Reschedule 1-Klik)</span>
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
                <p className="text-xs text-gray-500 mb-3">
                  Belum ada jadwal sesi aktif.
                </p>
                <Link
                  href="/"
                  className="inline-block py-2.5 px-5 bg-klinik-primary text-white font-bold text-xs rounded-xl shadow-md"
                >
                  Jadwalkan Sesi Terapi Baru
                </Link>
              </div>
            )}

            {/* Quick Rebook Card */}
            <div className="bg-gradient-to-br from-klinik-primary to-emerald-950 text-white rounded-3xl p-5 shadow-md">
              <h3 className="font-bold text-base font-serif mb-1 text-klinik-gold">
                Lanjutkan Tahap Pemulihan
              </h3>
              <p className="text-xs text-gray-200 leading-relaxed mb-4">
                Pemulihan akar masalah membutuhkan stimulasi bertahap untuk mencegah kompensasi otot berulang.
              </p>

              <Link
                href="/"
                className="w-full py-3 bg-klinik-gold hover:bg-klinik-gold/90 text-klinik-primary font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2"
              >
                <span>Jadwalkan Sesi Terapi Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* WhatsApp Contact Hotline */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-800">Butuh Bantuan Cepat?</p>
                <p className="text-[11px] text-gray-500">Admin WhatsApp Klinik Ruang Pulih</p>
              </div>
              <a
                href="https://wa.me/62811443327?text=Halo%20Admin%20Ruang%20Pulih%2C%20saya%20ingin%20bertanya%20seputar%20sesi%20terapi"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>0811443327</span>
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
