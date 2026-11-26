'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  User,
  Phone,
  Calendar,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Send,
  FileText,
  UserCheck,
} from 'lucide-react';
import { formatWITADate } from '@/lib/utils/timezone';

interface PatientSearchResult {
  id: string;
  full_name: string;
  whatsapp: string;
  age: number | null;
  address: string | null;
  magic_token: string;
  pin_last4: string;
}

interface SlotItem {
  slot_start: string;
  slot_end: string;
  session_name?: string;
  time_label: string;
  available: boolean;
  reason: 'BOOKED' | 'PAST' | null;
}

interface ManualBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualBookingModal({
  isOpen,
  onClose,
  onSuccess,
}: ManualBookingModalProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [age, setAge] = useState<string>('');
  const [address, setAddress] = useState('');
  const [complaintSummary, setComplaintSummary] = useState('');
  const [packageType, setPackageType] = useState<'SINGLE_150K' | 'PACKAGE_3X_400K'>('SINGLE_150K');
  const [sendWa, setSendWa] = useState(true);

  // Slot & Date state
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedPatientId(null);
      setFullName('');
      setWhatsapp('');
      setAge('');
      setAddress('');
      setComplaintSummary('');
      setPackageType('SINGLE_150K');
      setSendWa(true);
      setSelectedSlotStart(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Debounced patient search
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/admin/patients/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (res.ok) {
          setSearchResults(data.patients || []);
        }
      } catch (err) {
        console.warn('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch slots when selectedDate changes
  const fetchSlots = useCallback(async (dateStr: string) => {
    setIsLoadingSlots(true);
    setSelectedSlotStart(null);
    try {
      const res = await fetch(`/api/appointments/slots?date=${dateStr}`);
      const data = await res.json();
      if (res.ok) {
        setSlots(data.slots || []);
      }
    } catch (err) {
      console.warn('Fetch slots failed:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSlots(selectedDate);
    }
  }, [isOpen, selectedDate, fetchSlots]);

  const handleSelectPatient = (patient: PatientSearchResult) => {
    setSelectedPatientId(patient.id);
    setFullName(patient.full_name);
    setWhatsapp(patient.whatsapp);
    setAge(patient.age ? String(patient.age) : '');
    setAddress(patient.address || '');
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleClearSelectedPatient = () => {
    setSelectedPatientId(null);
    setFullName('');
    setWhatsapp('');
    setAge('');
    setAddress('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedSlotStart) {
      setErrorMsg('Silakan pilih salah satu sesi jam praktek yang tersedia.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/appointments/manual-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          full_name: fullName.trim(),
          whatsapp: whatsapp.trim(),
          age: age ? parseInt(age, 10) : null,
          address: address.trim() || null,
          complaint_summary: complaintSummary.trim() || null,
          package_type: packageType,
          slot_start: selectedSlotStart,
          send_wa_notification: sendWa,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan booking manual.');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-klinik-border max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-klinik-primary text-white">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-klinik-primary">
                Tambah Reservasi Jadwal Manual
              </h2>
              <p className="text-[11px] text-klinik-muted">
                Untuk pasien lama via WhatsApp atau reservasi langsung klinik (WITA)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Cari Pasien Lama */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700">
              Cari Data Pasien Terdaftar (Opsional)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : (
                  <Search className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau nomor WA pasien (min. 2 huruf)..."
                className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
              />
            </div>

            {/* Search Dropdown */}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPatient(p)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-klinik-bg flex items-center justify-between transition"
                  >
                    <div>
                      <div className="font-bold text-gray-800">{p.full_name}</div>
                      <div className="text-[11px] text-gray-500 font-mono">{p.whatsapp}</div>
                    </div>
                    <div className="text-right text-[10px] text-gray-400">
                      {p.age ? `${p.age} thn` : ''}
                      {p.address ? ` • ${p.address}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Patient Pill */}
            {selectedPatientId && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    Pasien Lama Terpilih: <strong>{fullName}</strong> ({whatsapp})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelectedPatient}
                  className="text-[11px] text-emerald-700 underline font-semibold hover:text-emerald-900"
                >
                  Lepas / Pasien Baru
                </button>
              </div>
            )}
          </div>

          <form id="manual-booking-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Nama & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Pak Herman"
                    className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nomor WhatsApp <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Phone className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0811xxxxxxxx"
                    className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-mono focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
                  />
                </div>
              </div>
            </div>

            {/* Usia & Alamat */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Usia (Tahun)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Misal: 48"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Alamat / Wilayah
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Panakkukang / Batua"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
                />
              </div>
            </div>

            {/* Pilihan Paket Terapi */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Paket Terapi
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPackageType('SINGLE_150K')}
                  className={`rounded-xl p-3 text-left border transition ${
                    packageType === 'SINGLE_150K'
                      ? 'border-klinik-primary bg-emerald-50/50 ring-1 ring-klinik-primary'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-xs text-klinik-primary">
                    Sesi Awal / Kontrol
                  </div>
                  <div className="text-[11px] font-bold text-emerald-700">Rp 150.000</div>
                  <div className="text-[10px] text-gray-400">1 Sesi Terapi Holistik (60 mnt)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPackageType('PACKAGE_3X_400K')}
                  className={`rounded-xl p-3 text-left border transition ${
                    packageType === 'PACKAGE_3X_400K'
                      ? 'border-klinik-primary bg-emerald-50/50 ring-1 ring-klinik-primary'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-xs text-klinik-primary">
                    Paket Pemulihan 3 Sesi
                  </div>
                  <div className="text-[11px] font-bold text-emerald-700">Rp 400.000</div>
                  <div className="text-[10px] text-gray-400">Hemat Rp 50.000 (3x kunjungan)</div>
                </button>
              </div>
            </div>

            {/* Pemilihan Tanggal & Sesi Jam (3 Sesi WITA) */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-klinik-primary" />
                  <span>Pilih Tanggal & Sesi Jam (WITA)</span>
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold focus:border-klinik-primary focus:outline-hidden"
                />
              </div>

              {/* Slots buttons */}
              {isLoadingSlots ? (
                <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-klinik-primary" />
                  <span>Memeriksa ketersediaan 3 sesi...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-400">
                  Tidak ada slot tersedia untuk tanggal ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {slots.map((s) => {
                    const isSelected = selectedSlotStart === s.slot_start;
                    const isDisabled = !s.available;

                    return (
                      <button
                        key={s.slot_start}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedSlotStart(s.slot_start)}
                        className={`rounded-xl p-3 text-center border transition relative ${
                          isSelected
                            ? 'border-klinik-primary bg-klinik-primary text-white shadow-xs'
                            : isDisabled
                            ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                            : 'border-gray-200 bg-white hover:border-klinik-primary hover:bg-emerald-50/30 text-gray-800'
                        }`}
                      >
                        <div className="text-[11px] font-bold">
                          {s.session_name || 'Sesi Praktek'}
                        </div>
                        <div className="text-sm font-black font-mono mt-0.5">
                          {s.time_label}
                        </div>
                        <div className="text-[10px] mt-1 font-semibold">
                          {isDisabled
                            ? s.reason === 'BOOKED'
                              ? 'Sudah Terisi'
                              : 'Lewat Jam'
                            : isSelected
                            ? '✓ Dipilih'
                            : 'Tersedia'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Catatan Keluhan Pasien */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <span>Catatan Keluhan / Instruksi Praktisi</span>
              </label>
              <textarea
                rows={2}
                value={complaintSummary}
                onChange={(e) => setComplaintSummary(e.target.value)}
                placeholder="Contoh: Pasien lama kontrol sesi ke-2 saraf pinggang / datang jam 16.00"
                className="w-full rounded-xl border border-gray-200 p-2.5 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
              />
            </div>

            {/* Checkbox Kirim WA Notifikasi */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWa}
                  onChange={(e) => setSendWa(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-sm border-gray-300 text-klinik-primary focus:ring-klinik-primary"
                />
                <div className="text-xs">
                  <span className="font-bold text-blue-950 flex items-center gap-1">
                    <Send className="h-3 w-3 text-blue-600" />
                    Kirim tiket & pengingat jadwal otomatis via WhatsApp
                  </span>
                  <p className="text-[11px] text-blue-800/80 mt-0.5">
                    Tiket konfirmasi jadwal dan pengingat H-1 / H-2 jam akan langsung dijadwalkan ke nomor WhatsApp pasien. Uncheck jika ingin booking senyap tanpa notifikasi WA.
                  </p>
                </div>
              </label>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-6 py-4 bg-gray-50/50 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            form="manual-booking-form"
            disabled={isSubmitting || !selectedSlotStart}
            className="inline-flex items-center gap-1.5 rounded-xl bg-klinik-primary px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-klinik-primaryLight transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Simpan Jadwal Reservasi</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
