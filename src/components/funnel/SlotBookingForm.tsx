'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, User, Phone, MapPin, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { formatWITADate } from '@/lib/utils/timezone';
import { getStoredUTM } from '@/lib/utils/utm';

export interface BookingSuccessData {
  appointment_id: string;
  patient_id: string;
  full_name: string;
  whatsapp: string;
  package_type: string;
  slot_start: string;
  slot_end: string;
  time_formatted: string;
  magic_token: string;
  pin_last4: string;
  intake_url: string;
  location: string;
}

export interface SlotBookingFormProps {
  leadId: string | null;
  packageType: 'SINGLE_150K' | 'PACKAGE_3X_400K';
  initialComplaint: string;
  onSuccess: (bookingData: BookingSuccessData) => void;
  onBack: () => void;
}

interface SlotItem {
  slot_start: string;
  slot_end: string;
  session_name?: string;
  time_label: string;
  available: boolean;
  reason: 'BOOKED' | 'PAST' | null;
}

export default function SlotBookingForm({
  leadId,
  packageType,
  initialComplaint,
  onSuccess,
  onBack,
}: SlotBookingFormProps) {
  // Generate next 7 dates in YYYY-MM-DD
  const [availableDates] = useState(() => {
    const dates: Array<{ dateStr: string; label: string; fullFormatted: string }> = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let label = formatWITADate(d).split(',')[0]; // Day name
      if (i === 0) label = 'Hari Ini';
      else if (i === 1) label = 'Besok';

      dates.push({
        dateStr,
        label,
        fullFormatted: `${day}/${month}`,
      });
    }
    return dates;
  });

  const [selectedDate, setSelectedDate] = useState(availableDates[0].dateStr);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Form inputs
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [complaintSummary, setComplaintSummary] = useState(initialComplaint || '');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch slots for selected date
  const fetchSlots = useCallback(async (dateStr: string) => {
    setIsLoadingSlots(true);
    setSlotsError(null);
    setSelectedSlot(null);

    try {
      const res = await fetch(`/api/appointments/slots?date=${dateStr}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat jadwal.');
      }
      setSlots(data.slots || []);
    } catch (err) {
      setSlotsError((err as Error).message);
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate, fetchSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedSlot) {
      setFormError('Silakan pilih salah satu jam yang masih kosong.');
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      setFormError('Nama lengkap wajib diisi (minimal 2 huruf).');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 10 || ageNum > 100) {
      setFormError('Usia wajib diisi antara 10 s/d 100 tahun.');
      return;
    }
    if (!whatsapp.trim() || whatsapp.trim().length < 8) {
      setFormError('Nomor WhatsApp aktif wajib diisi.');
      return;
    }
    if (!address.trim() || address.trim().length < 3) {
      setFormError('Alamat atau kecamatan di Makassar wajib diisi.');
      return;
    }

    setIsSubmitting(true);

    try {
      const utm = getStoredUTM();
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          full_name: fullName.trim(),
          age: ageNum,
          whatsapp: whatsapp.trim(),
          address: address.trim(),
          complaint_summary: complaintSummary.trim() || 'Keluhan awal hasil kuis',
          package_type: packageType,
          slot_start: selectedSlot,
          disclaimer_accepted: true,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
          utm_content: utm.utm_content,
          fbclid: utm.fbclid,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Double booking conflict
          setFormError(data.error || 'Maaf, slot jam ini baru saja diambil pasien lain. Silakan pilih jam kosong lainnya.');
          // Refresh slots
          fetchSlots(selectedDate);
          return;
        }
        throw new Error(data.error || 'Gagal memproses booking.');
      }

      // Success!
      onSuccess(data.booking);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-klinik-primary">
              Pilih Jadwal Kedatangan (WITA)
            </h2>
            <p className="text-xs text-klinik-muted">
              Ruang Pulih Makassar • Sesi 60 Menit • Jeda Sterilisasi 30 Menit
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-klinik-primary underline hover:text-klinik-gold"
          >
            Ubah Opsi
          </button>
        </div>

        {/* 1. Date Selector (7 Days) */}
        <div className="mt-5">
          <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-klinik-primary uppercase">
            <Calendar className="h-4 w-4 text-klinik-gold" />
            <span>Pilih Hari & Tanggal</span>
          </label>
          <div className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {availableDates.map((item) => {
              const isSelected = selectedDate === item.dateStr;
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    isSelected
                      ? 'border-klinik-primary bg-klinik-primary text-white shadow-sm'
                      : 'border-klinik-border bg-white text-klinik-text hover:border-klinik-gold/60 hover:bg-klinik-bg'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-klinik-gold' : 'text-gray-500'}`}>
                    {item.label}
                  </span>
                  <span className="text-xs font-extrabold">{item.fullFormatted}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Slot Time Buttons */}
        <div className="mt-6">
          <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-klinik-primary uppercase">
            <Clock className="h-4 w-4 text-klinik-gold" />
            <span>Pilih Jam Terapi yang Tersedia (WITA)</span>
          </label>

          {isLoadingSlots ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-klinik-gold" />
              <span className="ml-2 text-xs text-klinik-muted">Memeriksa ketersediaan slot...</span>
            </div>
          ) : slotsError ? (
            <div className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
              {slotsError}
            </div>
          ) : (
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {slots.map((s) => {
                const isSelected = selectedSlot === s.slot_start;
                const timeText = s.time_label.replace(' WITA', '');

                if (!s.available) {
                  return (
                    <div
                      key={s.slot_start}
                      className="flex min-h-[58px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-100 p-2.5 text-center opacity-60 cursor-not-allowed"
                    >
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        {s.session_name || 'Sesi Terapi'}
                      </span>
                      <span className="text-xs font-medium text-gray-500 line-through">
                        {timeText} WITA
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {s.reason === 'PAST' ? 'Waktu Lewat' : 'Sudah Terisi'}
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    key={s.slot_start}
                    type="button"
                    onClick={() => setSelectedSlot(s.slot_start)}
                    className={`flex min-h-[58px] flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-klinik-primary bg-emerald-50 font-bold text-klinik-primary ring-2 ring-klinik-primary shadow-sm'
                        : 'border-klinik-border bg-white text-klinik-text hover:border-klinik-gold/60 hover:bg-klinik-bg'
                    }`}
                  >
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-klinik-primary' : 'text-klinik-gold'}`}>
                      {s.session_name || 'Sesi Terapi'}
                    </span>
                    <span className="text-xs font-bold text-klinik-text">{timeText} WITA</span>
                    <span className="text-[10px] text-emerald-700 font-semibold">Tersedia</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Patient Details Form */}
        <form onSubmit={handleSubmit} className="mt-7 space-y-4 border-t border-gray-100 pt-6">
          <h3 className="text-sm font-bold text-klinik-primary">
            Data Diri Pasien
          </h3>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-klinik-text">
              Nama Lengkap Pasien *
            </label>
            <div className="relative mt-1">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Ibu Hj. Fatimah / Bpk. Rudi"
                className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-sm text-klinik-text placeholder-gray-400 focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Age */}
            <div>
              <label className="block text-xs font-semibold text-klinik-text">
                Usia Pasien (Tahun) *
              </label>
              <input
                type="number"
                required
                min={10}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Contoh: 52"
                className="mt-1 w-full rounded-xl border border-klinik-border bg-white px-3.5 py-2.5 text-sm text-klinik-text placeholder-gray-400 focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-xs font-semibold text-klinik-text">
                Nomor WhatsApp Aktif *
              </label>
              <div className="relative mt-1">
                <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="0811xxxxxxx"
                  className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-sm text-klinik-text placeholder-gray-400 focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
                />
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Tiket & link pemeriksaan dikirim ke nomor ini
              </p>
            </div>
          </div>

          {/* Address / Kecamatan */}
          <div>
            <label className="block text-xs font-semibold text-klinik-text">
              Alamat / Kecamatan di Makassar *
            </label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Contoh: Panakkukang / Batua / Antang"
                className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-sm text-klinik-text placeholder-gray-400 focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </div>

          {/* Complaint Details */}
          <div>
            <label className="block text-xs font-semibold text-klinik-text">
              Detail Keluhan Singkat (Opsional)
            </label>
            <div className="relative mt-1">
              <FileText className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <textarea
                rows={2}
                value={complaintSummary}
                onChange={(e) => setComplaintSummary(e.target.value)}
                placeholder="Misal: Sudah 3 bulan pinggang terasa menusuk saat ruku..."
                className="w-full rounded-xl border border-klinik-border bg-white py-2.5 pl-10 pr-4 text-sm text-klinik-text placeholder-gray-400 focus:border-klinik-primary focus:outline-none focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </div>

          {/* Form Error Banner */}
          {formError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !selectedSlot}
            className={`mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-md transition active:scale-[0.99] ${
              isSubmitting || !selectedSlot
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none'
                : 'bg-klinik-primary text-white hover:bg-klinik-primaryLight'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Mengunci Jadwal Anda...</span>
              </>
            ) : (
              <span>Konfirmasi & Kunci Jadwal Saya</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
