'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { Calendar, Clock, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { formatWITADate } from '@/lib/utils/timezone';

interface SlotItem {
  slot_start: string;
  slot_end: string;
  time_label: string;
  available: boolean;
  reason: 'BOOKED' | 'PAST' | null;
}

export default function ReschedulePage({
  params,
}: {
  params: Promise<{ appointment_id: string }>;
}) {
  const resolvedParams = use(params);
  const appointmentId = resolvedParams.appointment_id;

  const [magicToken, setMagicToken] = useState('');
  const [isTokenVerified, setIsTokenVerified] = useState(false);

  // Available dates for next 7 days
  const [availableDates] = useState(() => {
    const dates: Array<{ dateStr: string; label: string; fullFormatted: string }> = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let label = formatWITADate(d).split(',')[0];
      if (i === 0) label = 'Hari Ini';
      else if (i === 1) label = 'Besok';

      dates.push({ dateStr, label, fullFormatted: `${day}/${month}` });
    }
    return dates;
  });

  const [selectedDate, setSelectedDate] = useState(availableDates[0].dateStr);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ time_formatted: string } | null>(null);

  // Check URL search parameters for token
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('token');
      if (t) {
        setMagicToken(t);
        setIsTokenVerified(true);
      }
    }
  }, []);

  const fetchSlots = useCallback(async (dateStr: string) => {
    setIsLoadingSlots(true);
    setSlotsError(null);
    setSelectedSlot(null);

    try {
      const res = await fetch(`/api/appointments/slots?date=${dateStr}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat jadwal.');
      setSlots(data.slots || []);
    } catch (err) {
      setSlotsError((err as Error).message);
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (isTokenVerified) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, isTokenVerified, fetchSlots]);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRescheduleError(null);

    if (!selectedSlot) {
      setRescheduleError('Silakan pilih salah satu jam yang masih kosong.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          magic_token: magicToken.trim(),
          new_slot_start: selectedSlot,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setRescheduleError(data.error || 'Maaf, slot jam ini baru saja diambil pasien lain. Silakan pilih jam lainnya.');
          fetchSlots(selectedDate);
          return;
        }
        throw new Error(data.error || 'Gagal mengubah jadwal.');
      }

      setSuccessInfo({ time_formatted: data.appointment.time_formatted });
    } catch (err) {
      setRescheduleError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-klinik-bg p-4 md:p-8">
      <div className="mx-auto w-full max-w-xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <span className="inline-block rounded-full bg-klinik-primary/10 px-3 py-1 text-xs font-bold text-klinik-primary uppercase">
            Atur Ulang Jadwal Terapi (Reschedule)
          </span>
          <h1 className="mt-2 text-2xl font-black text-klinik-primary">
            Pindah Waktu Kedatangan
          </h1>
          <p className="mt-1 text-xs text-klinik-muted">
            Ruang Pulih Makassar • Jl. Batua Raya 10B No. 9 (WITA)
          </p>
        </div>

        {successInfo ? (
          /* Success Card */
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-bold text-klinik-primary">
              Jadwal Baru Berhasil Ditetapkan!
            </h2>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
              📅 Waktu Baru: {successInfo.time_formatted}
            </div>
            <p className="text-xs text-klinik-muted">
              Pemberitahuan perubahan jadwal dan tips persiapan telah dikirimkan ke WhatsApp Anda. Slot lama Anda otomatis telah dibuka kembali untuk pasien lain.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-klinik-primary underline hover:text-klinik-gold pt-2"
            >
              Kembali ke Halaman Utama
            </a>
          </div>
        ) : !isTokenVerified ? (
          /* Token Verification Step */
          <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-sm font-bold text-klinik-primary">
              Verifikasi Kepemilikan Jadwal
            </h2>
            <p className="mt-1 text-xs text-klinik-muted">
              Masukkan token akses (terdapat di tautan WhatsApp konfirmasi Anda) untuk melanjutkan:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (magicToken.trim()) setIsTokenVerified(true);
              }}
              className="mt-4 space-y-4"
            >
              <input
                type="text"
                required
                value={magicToken}
                onChange={(e) => setMagicToken(e.target.value)}
                placeholder="Contoh: rp-1a2b3c4d5e"
                className="w-full rounded-xl border border-klinik-border bg-white px-4 py-3 text-sm focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
              <button
                type="submit"
                className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-klinik-primary text-sm font-bold text-white transition hover:bg-klinik-primaryLight"
              >
                Verifikasi & Pilih Jadwal Baru
              </button>
            </form>
          </div>
        ) : (
          /* Date & Slot Picker */
          <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8 space-y-6">
            {/* 1. Date Selector */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-klinik-primary uppercase">
                <Calendar className="h-4 w-4 text-klinik-gold" />
                <span>Pilih Hari & Tanggal Baru</span>
              </label>
              <div className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {availableDates.map((item) => {
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(item.dateStr)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                        isSelected
                          ? 'border-klinik-primary bg-klinik-primary text-white shadow-xs'
                          : 'border-klinik-border bg-white text-klinik-text hover:border-klinik-gold/60'
                      }`}
                    >
                      <span className={`text-[10px] font-bold ${isSelected ? 'text-klinik-gold' : 'text-gray-500'}`}>
                        {item.label}
                      </span>
                      <span className="text-xs font-extrabold">{item.fullFormatted}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Slot Time Buttons */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-klinik-primary uppercase">
                <Clock className="h-4 w-4 text-klinik-gold" />
                <span>Pilih Jam Terapi yang Tersedia (WITA)</span>
              </label>

              {isLoadingSlots ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-klinik-gold" />
                  <span className="ml-2 text-xs text-klinik-muted">Memeriksa ketersediaan slot...</span>
                </div>
              ) : slotsError ? (
                <div className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                  {slotsError}
                </div>
              ) : (
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {slots.map((s) => {
                    const isSelected = selectedSlot === s.slot_start;
                    const timeText = s.time_label.replace(' WITA', '');

                    if (!s.available) {
                      return (
                        <div
                          key={s.slot_start}
                          className="flex min-h-[48px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-100 p-2 text-center opacity-60 cursor-not-allowed"
                        >
                          <span className="text-xs font-medium text-gray-500 line-through">
                            {timeText}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {s.reason === 'PAST' ? 'Lewat' : 'Penuh'}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={s.slot_start}
                        type="button"
                        onClick={() => setSelectedSlot(s.slot_start)}
                        className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${
                          isSelected
                            ? 'border-klinik-primary bg-emerald-50 font-bold text-klinik-primary ring-2 ring-klinik-primary'
                            : 'border-klinik-border bg-white text-klinik-text hover:border-klinik-gold/60'
                        }`}
                      >
                        <span className="text-xs font-bold">{timeText}</span>
                        <span className="text-[10px] text-emerald-700 font-semibold">Tersedia</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error Banner */}
            {rescheduleError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <span>{rescheduleError}</span>
              </div>
            )}

            {/* Submit Button */}
            <form onSubmit={handleRescheduleSubmit}>
              <button
                type="submit"
                disabled={isSubmitting || !selectedSlot}
                className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-md transition ${
                  isSubmitting || !selectedSlot
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none'
                    : 'bg-klinik-primary text-white hover:bg-klinik-primaryLight'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Menyimpan Jadwal Baru...</span>
                  </>
                ) : (
                  <>
                    <span>Simpan Perubahan Jadwal Baru</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
