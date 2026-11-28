'use client';

import { useEffect } from 'react';
import { CheckCircle2, MapPin, Calendar, Clock, User, Phone, ExternalLink, ArrowRight, ShieldCheck } from 'lucide-react';
import { trackPixelEvent } from '@/lib/utils/meta-pixel';
import type { BookingSuccessData } from './SlotBookingForm';

export interface BookingSuccessTicketProps {
  booking: BookingSuccessData;
  onReset?: () => void;
}

export default function BookingSuccessTicket({ booking }: BookingSuccessTicketProps) {
  // Trigger Meta Pixel 'Schedule' event on mount (Privacy-Safe: generic content_name & value only)
  useEffect(() => {
    const is3X = booking.package_type === 'PACKAGE_3X_400K';
    const genericPackageName = is3X ? 'program_b' : 'program_a';
    const packageValue = is3X ? 400000 : 150000;

    trackPixelEvent(
      'Schedule',
      {
        content_name: genericPackageName,
        value: packageValue,
        currency: 'IDR',
      },
      `schedule_${booking.appointment_id}`
    );
  }, [booking]);

  const bookingCode = `#RP-${booking.appointment_id.slice(0, 8).toUpperCase()}`;
  const gmapsUrl =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_LOCATION_URL ||
    process.env.NEXT_PUBLIC_GMAPS_REVIEW_URL ||
    'https://maps.google.com/?q=Ruang+Pulih+Makassar';

  const isPackage3X = booking.package_type === 'PACKAGE_3X_400K';

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {/* 1. Success Notification Header */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
          <CheckCircle2 className="h-10 w-10 stroke-[2.5]" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-klinik-primary">
          Alhamdulillah, Jadwal Terkunci!
        </h1>
        <p className="mt-1 text-sm text-klinik-muted">
          Reservasi Anda telah tercatat secara resmi di kalender terapis kami.
        </p>
      </div>

      {/* 2. Digital Ticket Card */}
      <div className="overflow-hidden rounded-2xl border border-klinik-border bg-white shadow-md">
        {/* Ticket Header Bar */}
        <div className="flex items-center justify-between bg-klinik-primary px-6 py-4 text-white">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-klinik-gold uppercase">
              Tiket Reservasi Terapi
            </div>
            <div className="text-base font-extrabold">{bookingCode}</div>
          </div>
          <div className="text-right">
            <span className="inline-block rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              Terkonfirmasi (BOOKED)
            </span>
          </div>
        </div>

        {/* Ticket Body */}
        <div className="p-6 space-y-5">
          {/* Appointment Time */}
          <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <Calendar className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Waktu Kedatangan (WITA)
              </div>
              <div className="mt-0.5 text-base font-extrabold text-klinik-primary">
                {booking.time_formatted}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-klinik-muted mt-1">
                <Clock className="h-3.5 w-3.5 text-klinik-gold" />
                <span>Durasi terapi 60 menit • Harap hadir 10 menit lebih awal</span>
              </div>
            </div>
          </div>

          {/* Patient Info */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <User className="h-4 w-4 text-gray-400" />
              <div>
                <span className="text-gray-400">Nama Pasien:</span>
                <div className="font-bold text-klinik-primary">{booking.full_name}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <div>
                <span className="text-gray-400">WhatsApp:</span>
                <div className="font-bold text-klinik-primary">{booking.whatsapp}</div>
              </div>
            </div>
          </div>

          {/* Location & Maps Button */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-klinik-gold mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-bold text-klinik-primary uppercase tracking-wider">
                  Lokasi Klinik
                </div>
                <div className="mt-0.5 text-sm font-semibold text-klinik-text">
                  Ruang Pulih Makassar
                </div>
                <div className="text-xs text-klinik-muted">
                  Jl. Batua Raya 10B No. 9, Makassar, Sulawesi Selatan
                </div>
              </div>
            </div>
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-klinik-primary/20 bg-klinik-bg py-2 text-xs font-bold text-klinik-primary transition hover:bg-klinik-primary/10"
            >
              <span>Buka Petunjuk Arah di Google Maps</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Package & Payment Summary */}
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-xs">
            <div>
              <span className="text-klinik-muted">Pilihan Layanan:</span>
              <div className="font-bold text-klinik-primary">
                {isPackage3X ? 'Paket Pemulihan (3x Sesi)' : 'Sesi Awal (1x Sesi 60 Menit)'}
              </div>
            </div>
            <div className="text-right">
              <span className="text-klinik-muted">Biaya:</span>
              <div className="text-sm font-extrabold text-klinik-primary">
                {isPackage3X ? 'Rp 400.000' : 'Rp 150.000'}
              </div>
              <span className="text-[10px] text-gray-400">(Dibayar di klinik saat kedatangan)</span>
            </div>
          </div>
        </div>

        {/* WA Notification Confirmation Note */}
        <div className="border-t border-dashed border-gray-200 bg-emerald-50/40 p-4 text-center text-xs text-emerald-900">
          <p>
            💬 Tiket dan link persiapan terapi telah kami antrekan ke WhatsApp Anda (<strong>{booking.whatsapp}</strong>).
          </p>
        </div>
      </div>

      {/* 3. Deep Intake Link Prompt (Preparation for Phase 4) */}
      <div className="rounded-2xl border border-klinik-gold/30 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-klinik-gold mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-klinik-primary">
              Langkah Selanjutnya: Pra-Pemeriksaan Awal
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-klinik-muted">
              Agar terapis kami dapat mempelajari riwayat keluhan, foto bungkus obat, atau hasil lab Anda sebelum tiba di klinik, Anda dapat melengkapi pra-pemeriksaan mandiri (membutuhkan waktu ~2 menit).
            </p>
            <a
              href={booking.intake_url}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-klinik-gold text-xs font-bold text-white shadow transition hover:bg-amber-600 active:scale-[0.99]"
            >
              <span>Isi Pra-Pemeriksaan Sekarang (PIN: {booking.pin_last4})</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
