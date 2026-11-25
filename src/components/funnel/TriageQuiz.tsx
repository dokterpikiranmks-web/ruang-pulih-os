'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import type { TriageInput } from '@/lib/triage/rules';

export interface TriageQuizProps {
  onComplete: (answers: TriageInput, utm: { utm_source?: string; utm_campaign?: string }) => void;
  isLoading: boolean;
}

const QUESTIONS = [
  {
    id: 1,
    title: 'Apa keluhan utama yang paling mengganggu tubuh Anda saat ini?',
    subtitle: 'Pilih satu yang paling membutuhkan penanganan segera',
    field: 'complaint_category',
    options: [
      { label: 'Pinggang / Saraf Kejepit', desc: 'Nyeri pinggang menjalar ke paha atau bokong' },
      { label: 'Kebas / Kesemutan Kaki-Tangan', desc: 'Mati rasa, tebal, atau kesemutan di telapak' },
      { label: 'Leher / Pundak / Migrain', desc: 'Tengkuk kaku, pundak tegang, kepala sering berdenyut' },
      { label: 'GERD / Asam Lambung / Cemas', desc: 'Perut begah, dada sesak, berdebar, susah rileks' },
      { label: 'Penyakit Kronis Lainnya', desc: 'Hipertensi, kaku persendian, insomnia, atau kelelahan menahun' },
    ],
  },
  {
    id: 2,
    title: 'Sudah berapa lama keluhan ini Anda rasakan?',
    subtitle: 'Membantu kami memperkirakan kedalaman penguraian saraf yang dibutuhkan',
    field: 'duration',
    options: [
      { label: 'Baru (< 1 bulan)', desc: 'Keluhan baru muncul baru-baru ini' },
      { label: '1 – 6 bulan', desc: 'Mulai mengganggu ritme aktivitas rutin harian' },
      { label: 'Menahun (> 6 bulan)', desc: 'Sudah berlangsung lama dan sering kambuh-kambuhan' },
    ],
  },
  {
    id: 3,
    title: 'Ikhtiar apa yang sudah pernah Anda coba sebelumnya?',
    subtitle: 'Pilih semua yang pernah Anda lakukan (bisa lebih dari satu)',
    field: 'prior_treatments',
    isMulti: true,
    options: [
      { label: 'Baru minum obat pereda nyeri', desc: 'Pereda nyeri medis atau vitamin saraf' },
      { label: 'Pijat urut biasa tapi kambuh', desc: 'Urut tradisional tapi beberapa hari kemudian sakit lagi' },
      { label: 'Medis / fisioterapi tapi belum tuntas', desc: 'Pernah terapi klinis namun ingin hasil lebih optimal' },
      { label: 'Belum pernah ditangani', desc: 'Baru pertama kali ingin mencoba terapi' },
    ],
  },
  {
    id: 4,
    title: 'Aktivitas apa yang paling terganggu akibat kondisi ini?',
    subtitle: 'Fokus tujuan pemulihan Anda bersama Ruang Pulih Makassar',
    field: 'disrupted_activity',
    options: [
      { label: 'Sholat & sujud terasa ngilu', desc: 'Sulit ruku/sujud, terpaksa sholat duduk' },
      { label: 'Tidur malam tidak nyenyak', desc: 'Sering terbangun karena rasa sakit atau cemas' },
      { label: 'Kerja / duduk lama tersiksa', desc: 'Pinggang atau leher kaku saat duduk bekerja' },
      { label: 'Aktivitas keluarga terhambat', desc: 'Sulit jalan jauh, menggendong cucu/anak' },
    ],
  },
  {
    id: 5,
    title: 'Bagaimana kesiapan Anda untuk ikhtiar pemulihan di klinik kami?',
    subtitle: 'Klinik kami berlokasi di Jl. Batua Raya 10B No. 9, Makassar',
    field: 'readiness_choice',
    options: [
      {
        label: 'Siap datang ke klinik & ikut proses bertahap',
        desc: 'Saya memahami pemulihan saraf adalah proses biologis yang butuh ketelatenan',
      },
      {
        label: 'Masih sekadar cari informasi dulu',
        desc: 'Saya ingin tahu penjelasan & biaya terlebih dahulu',
      },
    ],
  },
];

export default function TriageQuiz({ onComplete, isLoading }: TriageQuizProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<{
    complaint_category: string;
    duration: string;
    prior_treatments: string[];
    disrupted_activity: string;
    readiness_choice: string;
  }>({
    complaint_category: '',
    duration: '',
    prior_treatments: [],
    disrupted_activity: '',
    readiness_choice: '',
  });

  const [utm, setUtm] = useState<{ utm_source?: string; utm_campaign?: string }>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setUtm({
        utm_source: params.get('utm_source') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
      });
    }
  }, []);

  const currentQ = QUESTIONS[currentStep];

  const handleSingleSelect = (value: string) => {
    const updated = { ...answers, [currentQ.field]: value };
    setAnswers(updated);

    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step answered
      onComplete(updated as TriageInput, utm);
    }
  };

  const handleMultiSelect = (value: string) => {
    const currentList = [...answers.prior_treatments];
    const index = currentList.indexOf(value);
    if (index >= 0) {
      currentList.splice(index, 1);
    } else {
      currentList.push(value);
    }
    setAnswers({ ...answers, prior_treatments: currentList });
  };

  const handleNextFromMulti = () => {
    if (answers.prior_treatments.length === 0) {
      // Default to "Belum pernah ditangani" if none selected
      answers.prior_treatments = ['Belum pernah ditangani'];
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progressPercent = Math.round(((currentStep + 1) / QUESTIONS.length) * 100);

  if (isLoading) {
    return (
      <div className="flex min-h-[460px] flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-klinik-primary/10">
          <Sparkles className="h-10 w-10 animate-spin text-klinik-gold" />
        </div>
        <h3 className="text-xl font-bold text-klinik-primary">
          Menganalisa Titik Keluhan Tubuh Anda...
        </h3>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-klinik-muted">
          Kami memetakan keterkaitan jalur saraf, mikrosirkulasi, dan durasi keluhan Anda untuk menyusun rekomendasi terapi yang tepat.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Header & Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-klinik-muted">
          <span>Langkah {currentStep + 1} dari {QUESTIONS.length}</span>
          <span className="text-klinik-primary font-bold">{progressPercent}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-klinik-gold transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
        {currentStep > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-klinik-muted transition hover:text-klinik-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke pertanyaan sebelumnya
          </button>
        )}

        <h2 className="text-lg font-bold leading-snug text-klinik-primary md:text-xl">
          {currentQ.title}
        </h2>
        <p className="mt-1 text-xs text-klinik-muted md:text-sm">
          {currentQ.subtitle}
        </p>

        {/* Options List */}
        <div className="mt-6 space-y-3">
          {currentQ.options.map((opt) => {
            const isSelected = currentQ.isMulti
              ? answers.prior_treatments.includes(opt.label)
              : (answers as Record<string, unknown>)[currentQ.field] === opt.label;

            return (
              <button
                key={opt.label}
                type="button"
                onClick={() =>
                  currentQ.isMulti
                    ? handleMultiSelect(opt.label)
                    : handleSingleSelect(opt.label)
                }
                className={`group flex min-h-[58px] w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'border-klinik-primary bg-klinik-primary/5 shadow-sm ring-1 ring-klinik-primary'
                    : 'border-klinik-border bg-white hover:border-klinik-gold/60 hover:bg-klinik-bg'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isSelected
                      ? 'border-klinik-primary bg-klinik-primary text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-klinik-primary">
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-klinik-muted">
                    {opt.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Multi-select Next Button */}
        {currentQ.isMulti && (
          <button
            type="button"
            onClick={handleNextFromMulti}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-klinik-primary text-sm font-bold text-white shadow-md transition hover:bg-klinik-primaryLight active:scale-[0.99]"
          >
            Lanjut ke Pertanyaan Berikutnya
          </button>
        )}
      </div>
    </div>
  );
}
