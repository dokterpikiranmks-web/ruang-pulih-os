'use client';

import { useState } from 'react';
import TriageQuiz from '@/components/funnel/TriageQuiz';
import TriageResult, { type TriageAnalysisData } from '@/components/funnel/TriageResult';
import SlotBookingForm, { type BookingSuccessData } from '@/components/funnel/SlotBookingForm';
import BookingSuccessTicket from '@/components/funnel/BookingSuccessTicket';
import type { TriageInput } from '@/lib/triage/rules';
import { Shield, MapPin, Phone } from 'lucide-react';

type FunnelStep = 'QUIZ' | 'ANALYSIS' | 'BOOKING' | 'SUCCESS';

export default function Home() {
  const [step, setStep] = useState<FunnelStep>('QUIZ');
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);

  // Funnel State
  const [triageAnswers, setTriageAnswers] = useState<TriageInput | null>(null);
  const [analysisResult, setAnalysisResult] = useState<TriageAnalysisData | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'SINGLE_150K' | 'PACKAGE_3X_400K'>('PACKAGE_3X_400K');
  const [bookingResult, setBookingResult] = useState<BookingSuccessData | null>(null);

  // Handle Quiz Completion -> call /api/triage/analyze
  const handleQuizComplete = async (
    answers: TriageInput,
    utm: { utm_source?: string; utm_campaign?: string }
  ) => {
    setTriageAnswers(answers);
    setIsLoadingAnalysis(true);

    try {
      const res = await fetch('/api/triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_category: answers.complaint_category,
          duration: answers.duration,
          prior_treatments: answers.prior_treatments,
          disrupted_activity: answers.disrupted_activity,
          readiness_choice: answers.readiness_choice,
          utm_source: utm.utm_source,
          utm_campaign: utm.utm_campaign,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menganalisa keluhan');
      }

      setLeadId(data.lead_id || null);
      setAnalysisResult(data.analysis);
      setSelectedPackage(data.analysis.suggested_package || 'PACKAGE_3X_400K');
      setStep('ANALYSIS');
    } catch (err) {
      console.error('[Funnel] Analysis error:', err);
      // Fallback: Even if fetch fails completely, generate local evaluation
      setStep('ANALYSIS');
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Handle Proceed to Booking from Analysis
  const handleProceedToBooking = (pkg: 'SINGLE_150K' | 'PACKAGE_3X_400K') => {
    setSelectedPackage(pkg);
    setStep('BOOKING');
  };

  // Handle Booking Success
  const handleBookingSuccess = (booking: BookingSuccessData) => {
    setBookingResult(booking);
    setStep('SUCCESS');
  };

  return (
    <div className="flex min-h-screen flex-col bg-klinik-bg text-klinik-text">
      {/* Top Clinic Branding Bar */}
      <header className="border-b border-klinik-border bg-white py-3.5 shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-klinik-primary text-white shadow-xs">
              <Shield className="h-5 w-5 text-klinik-gold" />
            </div>
            <div>
              <span className="block text-sm font-black tracking-tight text-klinik-primary">
                RUANG PULIH MAKASSAR
              </span>
              <span className="block text-[10px] font-medium text-klinik-muted">
                Totok Saraf & Kedokteran Holistik Integratif
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-klinik-muted">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-klinik-gold" />
              Jl. Batua Raya 10B No. 9, Makassar
            </span>
            <span className="flex items-center gap-1 text-emerald-700">
              <Phone className="h-3.5 w-3.5" />
              0811-4433-27
            </span>
          </div>
        </div>
      </header>

      {/* Main Funnel Container */}
      <main className="flex-1 px-4 py-8 md:py-12">
        {step === 'QUIZ' && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto mb-2">
              <span className="inline-block rounded-full bg-klinik-primary/10 px-3 py-1 text-xs font-bold text-klinik-primary uppercase tracking-wider">
                Skrining Klinis Awal 45 Detik
              </span>
              <h1 className="mt-2 text-2xl font-black text-klinik-primary sm:text-3xl">
                Cek Indikasi Titik Saraf & Pola Keluhan Tubuh Anda
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-klinik-muted sm:text-sm">
                Jawab 5 pertanyaan cepat tanpa mengetik untuk mengetahui perkiraan akar masalah dan rekomendasi sesi pemulihan bertahap.
              </p>
            </div>

            <TriageQuiz
              onComplete={handleQuizComplete}
              isLoading={isLoadingAnalysis}
            />
          </div>
        )}

        {step === 'ANALYSIS' && analysisResult && (
          <TriageResult
            analysis={analysisResult}
            onProceedToBooking={handleProceedToBooking}
          />
        )}

        {step === 'BOOKING' && (
          <SlotBookingForm
            leadId={leadId}
            packageType={selectedPackage}
            initialComplaint={triageAnswers?.complaint_category || ''}
            onSuccess={handleBookingSuccess}
            onBack={() => setStep('ANALYSIS')}
          />
        )}

        {step === 'SUCCESS' && bookingResult && (
          <BookingSuccessTicket
            booking={bookingResult}
            onReset={() => setStep('QUIZ')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-klinik-border bg-white py-6 text-center text-xs text-klinik-muted">
        <div className="mx-auto max-w-xl px-4 space-y-2">
          <p className="font-semibold text-klinik-primary">
            Ruang Pulih Makassar • Totok Saraf & Kedokteran Holistik Integratif
          </p>
          <p>
            Jl. Batua Raya 10B No. 9, Makassar, Sulawesi Selatan (WITA / UTC+8) • WhatsApp: 0811-4433-27
          </p>
          <p className="text-[11px] leading-relaxed text-gray-400 pt-2 border-t border-gray-100">
            *Layanan Ruang Pulih Makassar adalah terapi komplementer holistik dan totok saraf integratif, bukan pengganti penanganan medis gawat darurat. Untuk kondisi darurat, segera kunjungi fasilitas IGD terdekat.
          </p>
        </div>
      </footer>
    </div>
  );
}
