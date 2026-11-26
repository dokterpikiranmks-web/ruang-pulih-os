'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Send,
  FileText,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { formatWITADateTime } from '@/lib/utils/timezone';

interface SlotItem {
  slot_start: string;
  slot_end: string;
  session_name?: string;
  time_label: string;
  available: boolean;
  reason: 'BOOKED' | 'PAST' | null;
}

export interface AppointmentEditData {
  id: string;
  patient_id: string;
  slot_start: string;
  slot_end: string;
  package_type: string;
  status: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED' | 'CANCELLED';
  amount_paid_idr: number;
  notes: string | null;
  patients: {
    id: string;
    full_name: string;
    whatsapp: string;
    magic_token: string;
  };
}

interface EditAppointmentModalProps {
  isOpen: boolean;
  appointment: AppointmentEditData | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditAppointmentModal({
  isOpen,
  appointment,
  onClose,
  onSuccess,
}: EditAppointmentModalProps) {
  const [status, setStatus] = useState<AppointmentEditData['status']>('CONFIRMED');
  const [packageType, setPackageType] = useState<'SINGLE_150K' | 'PACKAGE_3X_400K'>('SINGLE_150K');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [notifyWa, setNotifyWa] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (appointment && isOpen) {
      setStatus(appointment.status);
      setPackageType(
        appointment.package_type === 'PACKAGE_3X_400K' ? 'PACKAGE_3X_400K' : 'SINGLE_150K'
      );
      setAmountPaid(appointment.amount_paid_idr || 0);
      setNotes(appointment.notes || '');

      setIsRescheduling(false);
      setSelectedSlotStart(null);
      setNotifyWa(false);
      setErrorMsg(null);

      // Default date to current appointment date
      const apptDate = new Date(appointment.slot_start);
      const year = apptDate.getFullYear();
      const month = String(apptDate.getMonth() + 1).padStart(2, '0');
      const day = String(apptDate.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
    }
  }, [appointment, isOpen]);

  const fetchSlots = useCallback(async (dateStr: string) => {
    if (!dateStr) return;
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
    if (isOpen && isRescheduling && selectedDate) {
      fetchSlots(selectedDate);
    }
  }, [isOpen, isRescheduling, selectedDate, fetchSlots]);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const payload: {
        status?: AppointmentEditData['status'];
        package_type?: 'SINGLE_150K' | 'PACKAGE_3X_400K';
        complaint_summary?: string;
        amount_paid_idr?: number;
        slot_start?: string;
        notify_patient_wa?: boolean;
      } = {
        status,
        package_type: packageType,
        complaint_summary: notes,
        amount_paid_idr: amountPaid,
      };

      if (isRescheduling && selectedSlotStart) {
        payload.slot_start = selectedSlotStart;
        payload.notify_patient_wa = notifyWa;
      }

      const res = await fetch(`/api/admin/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Gagal memperbarui reservasi jadwal.');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAppointment = () => {
    if (
      window.confirm(
        'Yakin ingin membatalkan jadwal pasien ini? Slot waktu akan langsung dibuka kembali untuk pasien lain.'
      )
    ) {
      setStatus('CANCELLED');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-klinik-border max-h-[92vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-klinik-primary text-white">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-klinik-primary">
                Edit / Reschedule Jadwal
              </h2>
              <p className="text-[11px] text-klinik-muted">
                Pindah sesi jam, ubah paket, atau batalkan jadwal reservasi
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Patient Card Info */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-sm">
                {appointment.patients?.full_name || 'Pasien Anonim'}
              </span>
              <span className="font-mono text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                {appointment.patients?.whatsapp || '-'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="h-3.5 w-3.5 text-klinik-primary" />
              <span>
                Jadwal Saat Ini:{' '}
                <strong>{formatWITADateTime(appointment.slot_start)}</strong>
              </span>
            </div>
          </div>

          <form id="edit-appointment-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Status Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Status Reservasi
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    'CONFIRMED',
                    'COMPLETED',
                    'NO_SHOW',
                    'RESCHEDULED',
                    'CANCELLED',
                  ] as const
                ).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatus(st);
                      if (st === 'COMPLETED' && amountPaid === 0) {
                        setAmountPaid(
                          packageType === 'PACKAGE_3X_400K' ? 400000 : 150000
                        );
                      }
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-bold border transition text-center ${
                      status === st
                        ? st === 'CANCELLED'
                          ? 'border-red-500 bg-red-50 text-red-700 ring-1 ring-red-500'
                          : st === 'COMPLETED'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600'
                          : 'border-klinik-primary bg-emerald-50 text-klinik-primary ring-1 ring-klinik-primary'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {st === 'CONFIRMED'
                      ? 'Terkonfirmasi'
                      : st === 'COMPLETED'
                      ? 'Selesai Terapi'
                      : st === 'NO_SHOW'
                      ? 'No-Show'
                      : st === 'RESCHEDULED'
                      ? 'Dijadwalkan Ulang'
                      : 'Batalkan (Buka Slot)'}
                  </button>
                ))}
              </div>

              {status === 'CANCELLED' && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-[11px] text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>
                    Membatalkan jadwal akan otomatis melepas slot jam ini agar bisa dipesan pasien lain, serta membatalkan antrean WA pengingat.
                  </span>
                </div>
              )}
            </div>

            {/* Kas Masuk (jika status COMPLETED) */}
            {status === 'COMPLETED' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                <label className="block text-xs font-bold text-emerald-950">
                  Penerimaan Kas Aktual (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="w-full rounded-lg border border-emerald-300 bg-white py-1.5 px-3 text-xs font-mono font-bold text-emerald-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Pilihan Paket */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Paket Terapi
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPackageType('SINGLE_150K');
                    if (status === 'COMPLETED') setAmountPaid(150000);
                  }}
                  className={`rounded-xl p-2.5 text-left border transition ${
                    packageType === 'SINGLE_150K'
                      ? 'border-klinik-primary bg-emerald-50/50 ring-1 ring-klinik-primary'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-xs text-klinik-primary">Sesi Awal</div>
                  <div className="text-[11px] text-gray-500">Rp 150.000 (1 Sesi)</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPackageType('PACKAGE_3X_400K');
                    if (status === 'COMPLETED') setAmountPaid(400000);
                  }}
                  className={`rounded-xl p-2.5 text-left border transition ${
                    packageType === 'PACKAGE_3X_400K'
                      ? 'border-klinik-primary bg-emerald-50/50 ring-1 ring-klinik-primary'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-xs text-klinik-primary">Paket 3 Sesi</div>
                  <div className="text-[11px] text-gray-500">Rp 400.000</div>
                </button>
              </div>
            </div>

            {/* Reschedule Section Toggle */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-klinik-primary" />
                    <span>Pindah Jadwal / Reschedule Sesi</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Geser hari atau jam sesi praktek pasien ke sesi lain (WITA)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRescheduling(!isRescheduling)}
                  className={`text-xs font-bold px-3 py-1 rounded-lg border transition ${
                    isRescheduling
                      ? 'border-klinik-primary bg-klinik-primary text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {isRescheduling ? 'Tutup Pilihan Sesi' : 'Pindah Sesi'}
                </button>
              </div>

              {isRescheduling && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-gray-700">
                      Pilih Tanggal Baru:
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium focus:border-klinik-primary focus:outline-hidden"
                    />
                  </div>

                  {isLoadingSlots ? (
                    <div className="py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-klinik-primary" />
                      <span>Memeriksa 3 sesi praktek...</span>
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="py-3 text-center text-xs text-gray-400">
                      Tidak ada slot pada tanggal ini.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {slots.map((s) => {
                        const isCurrentSlot = s.slot_start === appointment.slot_start;
                        const isSelected = selectedSlotStart === s.slot_start;
                        const isDisabled = !s.available && !isCurrentSlot;

                        return (
                          <button
                            key={s.slot_start}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => setSelectedSlotStart(s.slot_start)}
                            className={`rounded-xl p-2.5 text-center border transition relative ${
                              isSelected
                                ? 'border-klinik-primary bg-klinik-primary text-white shadow-xs'
                                : isCurrentSlot
                                ? 'border-amber-300 bg-amber-50 text-amber-900'
                                : isDisabled
                                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                                : 'border-gray-200 bg-white hover:border-klinik-primary hover:bg-emerald-50/30 text-gray-800'
                            }`}
                          >
                            <div className="text-[10px] font-bold">
                              {s.session_name || 'Sesi Praktek'}
                            </div>
                            <div className="text-xs font-black font-mono mt-0.5">
                              {s.time_label}
                            </div>
                            <div className="text-[10px] mt-0.5 font-semibold">
                              {isCurrentSlot
                                ? 'Jadwal Aktif'
                                : isDisabled
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

                  {/* Notify Patient Checkbox */}
                  {selectedSlotStart && selectedSlotStart !== appointment.slot_start && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-2.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifyWa}
                          onChange={(e) => setNotifyWa(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-sm border-gray-300 text-klinik-primary focus:ring-klinik-primary"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-blue-950 flex items-center gap-1">
                            <Send className="h-3 w-3 text-blue-600" />
                            Kirim notifikasi perubahan jadwal ke WA pasien
                          </span>
                          <p className="text-[11px] text-blue-800 mt-0.5">
                            Kirimkan konfirmasi jadwal baru otomatis ke {appointment.patients?.whatsapp}.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes / Catatan */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <span>Catatan Pasien / Ringkasan Keluhan</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan perkembangan atau instruksi praktisi..."
                className="w-full rounded-xl border border-gray-200 p-2.5 text-xs focus:border-klinik-primary focus:outline-hidden focus:ring-1 focus:ring-klinik-primary"
              />
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50/50 rounded-b-2xl">
          <div>
            {status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={handleCancelAppointment}
                disabled={isSubmitting}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition disabled:opacity-50"
              >
                Batalkan Jadwal
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="submit"
              form="edit-appointment-form"
              disabled={isSubmitting}
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
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
