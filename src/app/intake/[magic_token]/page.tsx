'use client';

import { useState, use } from 'react';
import {
  ShieldAlert,
  Camera,
  Mic,
  MicOff,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  Activity,
  Brain,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { compressImageClient } from '@/lib/utils/image-compress';
import { calculateConfidenceScore } from '@/lib/intake/confidence';

interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  notes?: string;
}

interface LabResultItem {
  test_name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: 'NORMAL' | 'HIGH' | 'LOW';
}

export default function DeepIntakePage({
  params,
}: {
  params: Promise<{ magic_token: string }>;
}) {
  const resolvedParams = use(params);
  const magicToken = resolvedParams.magic_token;

  // Active step
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4>(1);

  // Section 1: Security & Red Flag Checklist
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [allergies, setAllergies] = useState('');
  const [hasKidneyLiverCondition, setHasKidneyLiverCondition] = useState(false);
  const [isPregnantOrNursing, setIsPregnantOrNursing] = useState(false);
  const [redFlags, setRedFlags] = useState<string[]>([]);

  // Section 1: Zero-Typing Photos
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [labResults, setLabResults] = useState<LabResultItem[]>([]);
  const [isExtractingVision, setIsExtractingVision] = useState(false);
  const [visionNotice, setVisionNotice] = useState<string | null>(null);

  // Section 2: ATM Timeline & Voice
  const [antecedents, setAntecedents] = useState('');
  const [triggers, setTriggers] = useState('');
  const [mediators, setMediators] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // Section 3: Metabolic, Digestion & Sleep
  const [mealHabits, setMealHabits] = useState('');
  const [digestiveSymptoms, setDigestiveSymptoms] = useState('');
  const [sleepHours, setSleepHours] = useState('6 - 7 jam');
  const [sleepQuality, setSleepQuality] = useState(6);

  // Section 4: Autonomic, Stress & Pain Map
  const [stressLevel, setStressLevel] = useState(5);
  const [sympatheticSymptoms, setSympatheticSymptoms] = useState<string[]>([]);
  const [selectedPainAreas, setSelectedPainAreas] = useState<string[]>(['Pinggang']);
  const [painScale, setPainScale] = useState(6);

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Calculate live confidence score
  const hasBasic = Boolean(
    antecedents.length > 5 ||
    voiceTranscript.length > 10 ||
    mealHabits.length > 5 ||
    selectedPainAreas.length > 0
  );
  const hasMeds = Boolean(medications.length > 0 || labResults.length > 0);
  const liveConfidence = calculateConfidenceScore({
    hasTriageData: true,
    hasLayer2Basic: hasBasic,
    hasMedicationsOrLabs: hasMeds,
    hasPractitionerVitals: false,
  });

  // Handle Photo Upload with HTML5 Canvas compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'MEDICATION' | 'LAB_RESULT') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingVision(true);
    setVisionNotice(null);

    try {
      const compressed = await compressImageClient(file, 1024, 0.7);

      const res = await fetch('/api/intake/extract-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: compressed.base64,
          doc_type: docType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membaca gambar');

      if (docType === 'MEDICATION' && Array.isArray(data.extracted)) {
        setMedications((prev) => [...prev, ...data.extracted]);
        setVisionNotice(`Berhasil mengekstrak ${data.extracted.length} data obat dari foto (${compressed.sizeKb} KB).`);
      } else if (docType === 'LAB_RESULT' && Array.isArray(data.extracted)) {
        setLabResults((prev) => [...prev, ...data.extracted]);
        setVisionNotice(`Berhasil mengekstrak ${data.extracted.length} parameter lab dari foto (${compressed.sizeKb} KB).`);
      }
    } catch (err) {
      setVisionNotice(`Pemberitahuan: ${(err as Error).message}`);
    } finally {
      setIsExtractingVision(false);
    }
  };

  // Web Speech API Voice-to-Text
  const toggleVoiceRecording = () => {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Browser Anda tidak mendukung perekaman suara otomatis. Silakan ketik cerita Anda pada kotak teks.');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = () => setIsRecording(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcriptText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcriptText += event.results[i][0].transcript;
        }
        setVoiceTranscript((prev) => (prev ? `${prev} ${transcriptText}` : transcriptText));
      };

      recognition.start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      setIsRecording(false);
    }
  };

  // Submit complete intake
  const handleSubmitIntake = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/intake/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          magic_token: magicToken,
          red_flag_checklist: redFlags,
          has_red_flag: redFlags.length > 0,
          medications_json: medications,
          lab_results_json: labResults,
          media_urls: [],
          atm_timeline_json: {
            antecedents: antecedents ? [antecedents] : [],
            triggers: triggers ? [triggers] : [],
            mediators: mediators ? [mediators] : [],
          },
          lifestyle_json: {
            weight_kg: weightKg,
            height_cm: heightCm,
            allergies,
            has_kidney_liver: hasKidneyLiverCondition,
            is_pregnant_nursing: isPregnantOrNursing,
            meal_habits: mealHabits,
            digestive_symptoms: digestiveSymptoms,
            sleep_hours: sleepHours,
            sleep_quality: sleepQuality,
          },
          autonomic_mindbody_json: {
            stress_level: stressLevel,
            sympathetic_symptoms: sympatheticSymptoms,
          },
          somatic_pain_map: {
            pain_areas: selectedPainAreas,
            pain_scale: painScale,
          },
          voice_transcript: voiceTranscript,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pra-pemeriksaan.');

      setIsSavedSuccess(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const RED_FLAG_OPTIONS = [
    { id: 'nyeri_dada', label: 'Nyeri dada menjalar ke lengan, leher, atau rahang' },
    { id: 'lumpuh_mendadak', label: 'Kelemahan atau kelumpuhan mendadak pada satu sisi tubuh' },
    { id: 'bab_bak_loss', label: 'Kehilangan kontrol buang air besar atau buang air kecil tiba-tiba' },
    { id: 'sesak_napas_berat', label: 'Sesak napas berat mendadak yang tidak kunjung reda' },
  ];

  const SYMPATHETIC_OPTIONS = [
    'Jantung sering berdebar tanpa sebab',
    'Napas terasa pendek / sering menghela napas',
    'Telapak tangan atau kaki sering dingin / berkeringat',
    'Pikiran sulit tenang (overthinking)',
    'Otot rahang atau bahu sering kaku tanpa disadari',
  ];

  const PAIN_AREA_OPTIONS = [
    'Pinggang Bawah / Tulang Ekor',
    'Bokong Menjalar ke Paha / Kaki',
    'Leher / Tengkuk Kaku',
    'Pundak & Belikat',
    'Lutut & Persendian Kaki',
    'Ulu Hati / Dada Tertekan',
    'Kepala / Pelipis / Migrain',
  ];

  return (
    <div className="flex min-h-screen flex-col bg-klinik-bg p-4 md:p-8 text-klinik-text">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Header & Confidence Meter */}
        <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-klinik-gold uppercase tracking-wider">
                Pra-Pemeriksaan Holistik Mandiri
              </span>
              <h1 className="text-xl font-black text-klinik-primary md:text-2xl">
                Data Riwayat Tubuh Pasien
              </h1>
            </div>
            <div className="text-right">
              <span className="text-xs text-klinik-muted">Akurasi Analisa</span>
              <div className="text-xl font-black text-klinik-primary">{liveConfidence}%</div>
            </div>
          </div>

          {/* Confidence Meter Bar */}
          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-linear-to-r from-emerald-600 to-klinik-gold transition-all duration-500"
                style={{ width: `${liveConfidence}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-klinik-muted font-medium">
              <span>Triage (45%)</span>
              <span>Intake Pasien (78% - 88%)</span>
              <span>Klinik Lapisan 3 (95%)</span>
            </div>
          </div>
        </div>

        {/* Emergency Red Flag Alert (if any selected) */}
        {redFlags.length > 0 && (
          <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-900">
                  PERINGATAN GEJALA DARURAT MEDIS TERDETEKSI
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-red-800">
                  Anda mencentang indikasi gejala darurat. Terapi komplementer di Ruang Pulih Makassar <strong>tidak dapat menggantikan penanganan darurat</strong>. Jika gejala ini sedang terjadi secara akut, harap segera kunjungi Instalasi Gawat Darurat (IGD) rumah sakit terdekat.
                </p>
              </div>
            </div>
          </div>
        )}

        {isSavedSuccess ? (
          /* Success Card */
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-bold text-klinik-primary">
              Alhamdulillah, Pra-Pemeriksaan Tersimpan!
            </h2>
            <p className="text-xs text-klinik-muted max-w-md mx-auto">
              Terapis kami telah menerima riwayat keluhan Anda. Saat Anda tiba di klinik di Jl. Batua Raya 10B No. 9, terapis akan memadukannya dengan pemeriksaan fisik aktual (Lapisan 3) untuk menjalankan Dewan Pakar AI.
            </p>
            <div className="pt-4">
              <a
                href="/"
                className="inline-flex rounded-xl bg-klinik-primary px-6 py-3 text-xs font-bold text-white transition hover:bg-klinik-primaryLight"
              >
                Kembali ke Beranda
              </a>
            </div>
          </div>
        ) : (
          /* Multi-Tab / Step Form */
          <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8 space-y-6">
            {/* Step Navigation Tabs */}
            <div className="grid grid-cols-4 gap-1.5 border-b border-gray-100 pb-4 text-center">
              {[
                { id: 1, label: '1. Keamanan & Obat', icon: HeartPulse },
                { id: 2, label: '2. Cerita Kronologi', icon: Brain },
                { id: 3, label: '3. Metabolik & Tidur', icon: Activity },
                { id: 4, label: '4. Stres & Peta Nyeri', icon: AlertTriangle },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as 1 | 2 | 3 | 4)}
                    className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all ${
                      isActive
                        ? 'bg-klinik-primary text-white font-bold'
                        : 'text-klinik-muted hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="mt-1 text-[10px] hidden sm:inline">{tab.label}</span>
                    <span className="mt-1 text-[10px] sm:hidden">Tab {tab.id}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: SAFETY, RED FLAGS & ZERO-TYPING PHOTOS */}
            {activeTab === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-klinik-primary">
                    1. Data Fisik & Profil Keamanan
                  </h3>
                  <p className="text-xs text-klinik-muted">
                    Memastikan terapi diberikan dengan aman dan sesuai kondisi tubuh Anda.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold">Berat Badan (kg)</label>
                    <input
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="Contoh: 65"
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Tinggi Badan (cm)</label>
                    <input
                      type="number"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="Contoh: 165"
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold">Riwayat Alergi (Makanan / Obat)</label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="Contoh: Alergi udang, alergi antalgin, dll"
                    className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasKidneyLiverCondition}
                      onChange={(e) => setHasKidneyLiverCondition(e.target.checked)}
                      className="rounded text-klinik-primary"
                    />
                    <span>Ada riwayat gangguan fungsi ginjal atau liver</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPregnantOrNursing}
                      onChange={(e) => setIsPregnantOrNursing(e.target.checked)}
                      className="rounded text-klinik-primary"
                    />
                    <span>Sedang hamil atau menyusui</span>
                  </label>
                </div>

                {/* Red Flag Checklist */}
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-2">
                  <label className="text-xs font-bold text-red-900 block">
                    Ceklist Red Flag Darurat (Centang jika mengalami):
                  </label>
                  {RED_FLAG_OPTIONS.map((rf) => (
                    <label key={rf.id} className="flex items-start gap-2 text-xs text-red-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={redFlags.includes(rf.id)}
                        onChange={(e) => {
                          if (e.target.checked) setRedFlags([...redFlags, rf.id]);
                          else setRedFlags(redFlags.filter((id) => id !== rf.id));
                        }}
                        className="mt-0.5 rounded text-red-600 focus:ring-red-600"
                      />
                      <span>{rf.label}</span>
                    </label>
                  ))}
                </div>

                {/* Zero-Typing Photo OCR */}
                <div className="border-t border-gray-100 pt-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-klinik-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="h-4 w-4 text-klinik-gold" />
                      <span>Zero-Typing: Foto Bungkus Obat & Kertas Lab</span>
                    </h4>
                    <p className="mt-0.5 text-[11px] text-klinik-muted">
                      Foto bungkus obat dokter / herbal / hasil lab terakhir. Sistem AI Vision akan mengekstrak otomatis.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-klinik-border p-4 text-center cursor-pointer hover:border-klinik-gold hover:bg-klinik-bg">
                      <Camera className="h-6 w-6 text-klinik-primary mb-1" />
                      <span className="text-xs font-bold text-klinik-primary">Foto Bungkus Obat</span>
                      <span className="text-[10px] text-gray-400">Kompresi otomatis &lt; 150 KB</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e, 'MEDICATION')}
                      />
                    </label>

                    <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-klinik-border p-4 text-center cursor-pointer hover:border-klinik-gold hover:bg-klinik-bg">
                      <Camera className="h-6 w-6 text-klinik-primary mb-1" />
                      <span className="text-xs font-bold text-klinik-primary">Foto Kertas Hasil Lab</span>
                      <span className="text-[10px] text-gray-400">Darah / rontgen / gula</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(e, 'LAB_RESULT')}
                      />
                    </label>
                  </div>

                  {isExtractingVision && (
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                      <Loader2 className="h-4 w-4 animate-spin text-klinik-gold" />
                      <span>Sedang membaca teks obat/lab menggunakan Gemini Vision...</span>
                    </div>
                  )}

                  {visionNotice && (
                    <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                      {visionNotice}
                    </div>
                  )}

                  {/* List of extracted medications */}
                  {medications.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-klinik-primary">
                        <span>Daftar Obat Terdeteksi ({medications.length})</span>
                      </div>
                      {medications.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 p-2 text-xs">
                          <div>
                            <strong>{m.name}</strong> • {m.dosage} ({m.frequency})
                          </div>
                          <button
                            type="button"
                            onClick={() => setMedications(medications.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab(2)}
                  className="w-full rounded-xl bg-klinik-primary py-3 text-xs font-bold text-white transition hover:bg-klinik-primaryLight"
                >
                  Lanjut ke Bagian 2 (Kronologi & Suara)
                </button>
              </div>
            )}

            {/* TAB 2: ATM TIMELINE & VOICE-TO-STRUCTURED-DATA */}
            {activeTab === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-klinik-primary">
                    2. Cerita Kronologi Keluhan (ATM Timeline)
                  </h3>
                  <p className="text-xs text-klinik-muted">
                    Ceritakan kapan pertama kali muncul, pemicu awal, dan hal yang memperberat keluhan.
                  </p>
                </div>

                {/* Voice story button */}
                <div className="rounded-xl border border-klinik-gold/40 bg-amber-50/40 p-4 text-center space-y-3">
                  <span className="text-xs font-bold text-klinik-primary block">
                    Malas Mengetik? Rekam Suara Anda (1–2 Menit)
                  </span>
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition shadow-sm ${
                      isRecording
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-klinik-gold text-white hover:bg-amber-600'
                    }`}
                  >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span>{isRecording ? 'Berhenti Merekam' : 'Mulai Rekam Suara'}</span>
                  </button>
                  <p className="text-[10px] text-gray-500">
                    Suara Anda akan otomatis diubah menjadi teks oleh browser (Bahasa Indonesia).
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold">Transkrip / Cerita Keluhan Anda</label>
                  <textarea
                    rows={4}
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder="Contoh: Keluhan pertama kali muncul sekitar 4 bulan lalu setelah mengangkat galon air. Awalnya cuma pegal di pinggang, tapi makin lama menjalar ke paha kiri..."
                    className="mt-1 w-full rounded-xl border border-klinik-border p-3 text-xs focus:outline-none focus:ring-1 focus:ring-klinik-primary"
                  />
                </div>

                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <h4 className="text-xs font-bold text-klinik-primary">Faktor Kronologi Spesifik (Opsional)</h4>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Kebiasaan Lama / Riwayat (Antecedents)</label>
                    <input
                      type="text"
                      value={antecedents}
                      onChange={(e) => setAntecedents(e.target.value)}
                      placeholder="Contoh: Sering duduk kerja >8 jam, jarang olahraga, stres kerja"
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Pemicu Awal (Triggers)</label>
                    <input
                      type="text"
                      value={triggers}
                      onChange={(e) => setTriggers(e.target.value)}
                      placeholder="Contoh: Pernah jatuh terduduk, angkat beban berat, masuk angin"
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Hal yang Memperberat (Mediators)</label>
                    <input
                      type="text"
                      value={mediators}
                      onChange={(e) => setMediators(e.target.value)}
                      placeholder="Contoh: Duduk lama di mobil, cuaca dingin, telat makan"
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab(1)}
                    className="w-1/3 rounded-xl border border-gray-300 py-3 text-xs font-bold text-gray-600"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab(3)}
                    className="w-2/3 rounded-xl bg-klinik-primary py-3 text-xs font-bold text-white transition hover:bg-klinik-primaryLight"
                  >
                    Lanjut ke Bagian 3
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: METABOLIC, DIGESTION & SLEEP */}
            {activeTab === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-klinik-primary">
                    3. Ritme Metabolik, Pencernaan & Tidur
                  </h3>
                  <p className="text-xs text-klinik-muted">
                    Kesehatan saraf sangat dipengaruhi oleh mikrobioma usus dan regenerasi sel saat tidur malam.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold">Pola Makan Harian</label>
                  <input
                    type="text"
                    value={mealHabits}
                    onChange={(e) => setMealHabits(e.target.value)}
                    placeholder="Contoh: Sering telat makan, suka kopi manis, makan malam di atas jam 9"
                    className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold">Keluhan Pencernaan / Perut</label>
                  <input
                    type="text"
                    value={digestiveSymptoms}
                    onChange={(e) => setDigestiveSymptoms(e.target.value)}
                    placeholder="Contoh: Sering begah, asam lambung naik ke kerongkongan, BAB tidak teratur"
                    className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold">Rata-rata Jam Tidur Malam</label>
                    <select
                      value={sleepHours}
                      onChange={(e) => setSleepHours(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-klinik-border p-2.5 text-xs bg-white"
                    >
                      <option>&lt; 5 jam (Kurang tidur)</option>
                      <option>5 - 6 jam</option>
                      <option>6 - 7 jam</option>
                      <option>&gt; 8 jam</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Kualitas Tidur (Skala 1 - 10)</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={sleepQuality}
                        onChange={(e) => setSleepQuality(parseInt(e.target.value, 10))}
                        className="w-full accent-klinik-gold"
                      />
                      <span className="text-xs font-bold text-klinik-primary w-6 text-right">
                        {sleepQuality}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab(2)}
                    className="w-1/3 rounded-xl border border-gray-300 py-3 text-xs font-bold text-gray-600"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab(4)}
                    className="w-2/3 rounded-xl bg-klinik-primary py-3 text-xs font-bold text-white transition hover:bg-klinik-primaryLight"
                  >
                    Lanjut ke Bagian 4
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: AUTONOMIC, STRESS & PAIN MAP */}
            {activeTab === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-klinik-primary">
                    4. Sistem Saraf Otonom, Beban Pikiran & Peta Nyeri
                  </h3>
                  <p className="text-xs text-klinik-muted">
                    Memetakan kompresi saraf somatik dan tonus saraf simpatis vs parasimpatis.
                  </p>
                </div>

                {/* Stress Scale */}
                <div>
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Tingkat Beban Pikiran / Stres (1 - 10)</span>
                    <span className="font-bold text-klinik-primary text-sm">{stressLevel}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={stressLevel}
                    onChange={(e) => setStressLevel(parseInt(e.target.value, 10))}
                    className="mt-2 w-full accent-klinik-primary"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>1: Sangat Rileks</span>
                    <span>10: Sangat Tertekan</span>
                  </div>
                </div>

                {/* Sympathetic signs */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold block">Gejala Saraf Otonom Terasa Dominan:</label>
                  {SYMPATHETIC_OPTIONS.map((symp) => (
                    <label key={symp} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sympatheticSymptoms.includes(symp)}
                        onChange={(e) => {
                          if (e.target.checked) setSympatheticSymptoms([...sympatheticSymptoms, symp]);
                          else setSympatheticSymptoms(sympatheticSymptoms.filter((s) => s !== symp));
                        }}
                        className="rounded text-klinik-primary"
                      />
                      <span>{symp}</span>
                    </label>
                  ))}
                </div>

                {/* Pain map */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <label className="text-xs font-semibold block">Pilih Area Nyeri Utama:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAIN_AREA_OPTIONS.map((area) => {
                      const isSelected = selectedPainAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            if (isSelected) setSelectedPainAreas(selectedPainAreas.filter((a) => a !== area));
                            else setSelectedPainAreas([...selectedPainAreas, area]);
                          }}
                          className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                            isSelected
                              ? 'border-klinik-primary bg-emerald-50 font-bold text-klinik-primary'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pain Scale */}
                <div>
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>Skala Rasa Nyeri Saat Ini (1 - 10)</span>
                    <span className="font-bold text-klinik-primary text-sm">{painScale}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={painScale}
                    onChange={(e) => setPainScale(parseInt(e.target.value, 10))}
                    className="mt-2 w-full accent-klinik-gold"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>1: Ringan / Pegal</span>
                    <span>10: Sangat Berat / Menusuk</span>
                  </div>
                </div>

                {/* Save error banner */}
                {saveError && (
                  <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
                    {saveError}
                  </div>
                )}

                {/* Submit button */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab(3)}
                    className="w-1/3 rounded-xl border border-gray-300 py-3 text-xs font-bold text-gray-600"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSubmitIntake}
                    className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-klinik-primary py-3.5 text-xs font-bold text-white shadow-md transition hover:bg-klinik-primaryLight"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Menyimpan Pra-Pemeriksaan...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-klinik-gold" />
                        <span>Simpan Pra-Pemeriksaan Lengkap</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
