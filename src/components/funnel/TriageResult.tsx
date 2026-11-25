'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, MessageCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { trackPixelEvent } from '@/lib/utils/meta-pixel';

export interface TriageAnalysisData {
  severity_label: string;
  lead_temperature: 'HOT' | 'COLD';
  readiness_score: number;
  recommended_sessions: string;
  session_count_min: number;
  session_count_max: number;
  suggested_package: 'SINGLE_150K' | 'PACKAGE_3X_400K';
  root_cause_base: string;
  triage_summary: string;
  is_ai_polished: boolean;
}

export interface TriageResultProps {
  analysis: TriageAnalysisData;
  onProceedToBooking: (packageType: 'SINGLE_150K' | 'PACKAGE_3X_400K') => void;
}

export default function TriageResult({ analysis, onProceedToBooking }: TriageResultProps) {
  const [selectedPackage, setSelectedPackage] = useState<'SINGLE_150K' | 'PACKAGE_3X_400K'>(
    analysis.suggested_package || 'PACKAGE_3X_400K'
  );
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [forceShowBooking, setForceShowBooking] = useState(analysis.lead_temperature === 'HOT');

  // Trigger Meta Pixel 'Lead' event on mount
  useEffect(() => {
    trackPixelEvent('Lead', {
      severity: analysis.severity_label,
      temperature: analysis.lead_temperature,
      readiness_score: analysis.readiness_score,
    });
  }, [analysis]);

  const isColdLead = analysis.lead_temperature === 'COLD' && !forceShowBooking;

  const waConsultUrl = `https://wa.me/62811443327?text=${encodeURIComponent(
    `Halo Ruang Pulih Makassar, saya baru saja mengisi kuis analisa kondisi (${analysis.severity_label}). Saya ingin konsultasi ringan terlebih dahulu via WhatsApp.`
  )}`;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {/* 1. Header & Severity Badge */}
      <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            Analisa Awal Selesai
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {analysis.recommended_sessions}
          </span>
        </div>

        <h1 className="mt-4 text-xl font-extrabold leading-snug text-klinik-primary md:text-2xl">
          {analysis.severity_label}
        </h1>

        {/* Empathetic Summary */}
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm leading-relaxed text-emerald-950">
          <p>{analysis.triage_summary}</p>
        </div>

        {/* Biological Mechanism */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h4 className="text-xs font-bold tracking-wider text-klinik-primary uppercase">
            Mengapa Terapi Bertahap Dibutuhkan?
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-klinik-muted">
            {analysis.root_cause_base}
          </p>
        </div>
      </div>

      {/* 2. Price Anchoring & Package Selection */}
      <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
        <div className="text-center md:text-left">
          <h3 className="text-lg font-bold text-klinik-primary">
            Pilihan Rencana Terapi di Makassar
          </h3>
          <p className="mt-1 text-xs text-klinik-muted">
            Transparansi biaya tanpa ada biaya tersembunyi. Silakan tentukan opsi yang paling nyaman untuk Anda:
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          {/* Package 2: 3 Sesi Pemulihan (Recommended) */}
          <div
            onClick={() => setSelectedPackage('PACKAGE_3X_400K')}
            className={`relative cursor-pointer rounded-xl border-2 p-5 transition-all ${
              selectedPackage === 'PACKAGE_3X_400K'
                ? 'border-klinik-primary bg-emerald-50/30 shadow-md ring-1 ring-klinik-primary'
                : 'border-klinik-border bg-white hover:border-klinik-gold/60'
            }`}
          >
            <div className="absolute -top-3 right-4 rounded-full bg-klinik-gold px-3 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
              Rekomendasi (Hemat Rp 50.000)
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-klinik-primary">
                  Paket Pemulihan (3x Sesi Terarah)
                </div>
                <div className="text-xs text-klinik-muted">
                  Durasi 60 menit per sesi • Terjadwal bertahap
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold text-klinik-primary">
                  Rp 400.000
                </div>
                <div className="text-[11px] text-gray-400 line-through">
                  Rp 450.000
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-klinik-text">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Penguraian titik kompresi saraf & mikrosirkulasi menyeluruh</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Prioritas jadwal dan evaluasi respon pemulihan antar-sesi</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Akses pemantauan progres & protokol mandiri di Aplikasi Pasien</span>
              </li>
            </ul>
          </div>

          {/* Package 1: Single Session */}
          <div
            onClick={() => setSelectedPackage('SINGLE_150K')}
            className={`cursor-pointer rounded-xl border-2 p-5 transition-all ${
              selectedPackage === 'SINGLE_150K'
                ? 'border-klinik-primary bg-emerald-50/30 shadow-md ring-1 ring-klinik-primary'
                : 'border-klinik-border bg-white hover:border-klinik-gold/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-klinik-primary">
                  Sesi Awal (1x Sesi Terapi)
                </div>
                <div className="text-xs text-klinik-muted">
                  Durasi 60 menit evaluasi & penguraian awal
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold text-klinik-primary">
                  Rp 150.000
                </div>
                <div className="text-[11px] text-gray-500">Per kedatangan</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-klinik-text">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Palpasi fisik & deteksi titik jepitan saraf utama</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Penguraian somatik awal & evaluasi respon tubuh pasien</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 3. Lead Filtering & Disclaimer / Booking CTA */}
      <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
        {isColdLead ? (
          /* COLD LEAD: Konsultasi WA dulu agar tidak menyumbat kalender */
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-klinik-primary">
              Masih Ragu atau Ingin Tanya Dulu?
            </h3>
            <p className="text-xs text-klinik-muted">
              Tim kami di Jl. Batua Raya siap menjawab pertanyaan Anda mengenai keluhan dan prosedur terapi dengan senang hati.
            </p>
            <a
              href={waConsultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.99]"
            >
              <MessageCircle className="h-5 w-5" />
              <span>Tanya Dulu via WhatsApp Klinik (0811-4433-27)</span>
            </a>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setForceShowBooking(true)}
                className="text-xs text-klinik-primary underline underline-offset-4 hover:text-klinik-gold"
              >
                Atau tetap ingin langsung lihat jadwal kosong terdekat
              </button>
            </div>
          </div>
        ) : (
          /* HOT LEAD: Mandatory Disclaimer + Calendar Button */
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Pernyataan Pemahaman Pasien (Wajib)
                  </h4>
                  <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-amber-950">
                    <input
                      type="checkbox"
                      checked={disclaimerAccepted}
                      onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-amber-400 text-klinik-primary focus:ring-klinik-primary"
                    />
                    <span>
                      <strong>Saya memahami</strong> bahwa pemulihan saraf dan holistik adalah proses biologis bertahap yang hasilnya berbeda pada tiap individu, bukan pengobatan instan sekali datang langsung sembuh total.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!disclaimerAccepted}
              onClick={() => onProceedToBooking(selectedPackage)}
              className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition shadow-md active:scale-[0.99] ${
                disclaimerAccepted
                  ? 'bg-klinik-primary text-white hover:bg-klinik-primaryLight'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none'
              }`}
            >
              <span>Lihat Jadwal Kosong Terdekat</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            {!disclaimerAccepted && (
              <p className="text-center text-[11px] text-gray-400">
                *Centang kotak persetujuan di atas untuk membuka pilihan jam kosong klinik.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
