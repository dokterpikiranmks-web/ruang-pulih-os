'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Users,
  DollarSign,
  Cpu,
  CheckCircle,
  XCircle,
  LogOut,
  ChevronRight,
  Loader2,
  Clock,
  Sparkles,
  AlertTriangle,
  MessageSquare,
  Copy,
  ExternalLink,
  Check,
  Plus,
  Pencil,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatWITADateTime, formatWITATime } from '@/lib/utils/timezone';
import { getTrafficSourceBadge } from '@/lib/utils/utm';
import ManualBookingModal from '@/components/admin/ManualBookingModal';
import EditAppointmentModal from '@/components/admin/EditAppointmentModal';

interface AppointmentRecord {
  id: string;
  patient_id: string;
  slot_start: string;
  slot_end: string;
  package_type: string;
  status: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED' | 'CANCELLED';
  amount_paid_idr: number;
  notes: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  fbclid?: string | null;
  patients: {
    id: string;
    full_name: string;
    whatsapp: string;
    magic_token: string;
  };
}

interface AdaptationAlertRecord {
  id: string;
  patient_id: string;
  pain_score: number;
  ai_adaptation_alert: string;
  logged_at: string;
  patients: {
    full_name: string;
    whatsapp: string;
  };
}

interface InternalReviewRecord {
  id: string;
  rating: number;
  feedback_text: string | null;
  created_at: string;
  patients: {
    full_name: string;
    whatsapp: string;
  };
}

interface FailedWaRecord {
  id: string;
  trigger_type: string;
  message_body: string;
  last_error: string | null;
  scheduled_for: string;
  retry_count: number;
  patients: {
    full_name: string;
    whatsapp: string;
  };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [adaptationAlerts, setAdaptationAlerts] = useState<AdaptationAlertRecord[]>([]);
  const [internalReviews, setInternalReviews] = useState<InternalReviewRecord[]>([]);
  const [failedWaQueue, setFailedWaQueue] = useState<FailedWaRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Stats
  const [stats, setStats] = useState({
    todayCount: 0,
    completedMonth: 0,
    revenueIdr: 0,
    aiCostIdr: 0,
  });

  const [activeModalAppt, setActiveModalAppt] = useState<AppointmentRecord | null>(null);
  const [modalAmountPaid, setModalAmountPaid] = useState<number>(150000);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Manual booking and edit modals
  const [isManualBookingOpen, setIsManualBookingOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRecord | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();

    try {
      // 1. Fetch appointments with patient details and UTM attribution
      const { data: apptData, error } = await supabase
        .from('appointments')
        .select('id, patient_id, slot_start, slot_end, package_type, status, amount_paid_idr, notes, utm_source, utm_medium, utm_campaign, utm_content, fbclid, patients(id, full_name, whatsapp, magic_token)')
        .order('slot_start', { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (apptData || []) as any[];
      setAppointments(list);

      // Compute stats
      const now = new Date();
      const todayIsoPrefix = now.toISOString().split('T')[0];

      let todayCount = 0;
      let completedMonth = 0;
      let revenueIdr = 0;

      list.forEach((item) => {
        if (item.slot_start?.startsWith(todayIsoPrefix)) {
          todayCount++;
        }
        if (item.status === 'COMPLETED') {
          completedMonth++;
          revenueIdr += item.amount_paid_idr || 0;
        }
      });

      // 2. Fetch AI usage logs sum
      const { data: aiLogs } = await supabase
        .from('ai_usage_logs')
        .select('cost_idr');

      let totalAiCost = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((aiLogs as any[]) || []).forEach((log: any) => {
        totalAiCost += Number(log.cost_idr) || 0;
      });

      setStats({
        todayCount,
        completedMonth,
        revenueIdr,
        aiCostIdr: Math.round(totalAiCost * 100) / 100,
      });

      // 3. Fetch adaptation alerts (Agent 7)
      const { data: alertData } = await supabase
        .from('progress_logs')
        .select('id, patient_id, pain_score, ai_adaptation_alert, logged_at, patients(full_name, whatsapp)')
        .not('ai_adaptation_alert', 'is', null)
        .order('logged_at', { ascending: false })
        .limit(10);
      setAdaptationAlerts((alertData || []) as any[]);

      // 4. Fetch internal reviews (stars 1-3)
      const { data: revData } = await supabase
        .from('patient_reviews')
        .select('id, rating, feedback_text, created_at, patients(full_name, whatsapp)')
        .order('created_at', { ascending: false })
        .limit(10);
      setInternalReviews((revData || []) as any[]);

      // 5. Fetch failed WA queue items
      const { data: failData } = await supabase
        .from('wa_queue')
        .select('id, trigger_type, message_body, last_error, scheduled_for, retry_count, patients(full_name, whatsapp)')
        .eq('status', 'FAILED')
        .order('scheduled_for', { ascending: false })
        .limit(10);
      setFailedWaQueue((failData || []) as any[]);
    } catch (err) {
      console.warn('[Admin] Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  const handleUpdateStatus = async (
    appointmentId: string,
    newStatus: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW',
    amountPaid: number = 0
  ) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch('/api/admin/appointments/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          status: newStatus,
          amount_paid_idr: amountPaid,
        }),
      });

      if (!res.ok) throw new Error('Gagal memperbarui status');
      setActiveModalAppt(null);
      fetchDashboardData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Filtered list
  const filteredAppointments = appointments.filter((a) => {
    if (filterStatus === 'ALL') return true;
    return a.status === filterStatus;
  });

  return (
    <div className="min-h-screen bg-klinik-bg text-klinik-text">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-klinik-border bg-white/95 px-6 py-4 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-klinik-primary text-white font-serif font-black shadow-xs">
              RP
            </div>
            <div>
              <h1 className="text-lg font-bold text-klinik-primary leading-tight">
                Ruang Pulih Makassar
              </h1>
              <p className="text-[11px] text-klinik-muted">
                Dashboard Praktisi • Clinical AI & Retention Engine (WITA)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-klinik-border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Clock className="h-3.5 w-3.5 text-klinik-muted" />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-klinik-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Jadwal Hari Ini</span>
              <Calendar className="h-4 w-4 text-klinik-gold" />
            </div>
            <div className="mt-2 text-2xl font-black text-klinik-primary">{stats.todayCount}</div>
            <div className="mt-1 text-[11px] text-gray-400">Pasien terdaftar hari ini</div>
          </div>

          <div className="rounded-2xl border border-klinik-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Pasien Hadir</span>
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-700">{stats.completedMonth}</div>
            <div className="mt-1 text-[11px] text-gray-400">Total sesi selesai (COMPLETED)</div>
          </div>

          <div className="rounded-2xl border border-klinik-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Omzet Masuk</span>
              <DollarSign className="h-4 w-4 text-klinik-gold" />
            </div>
            <div className="mt-2 text-xl font-black text-klinik-primary">
              Rp {stats.revenueIdr.toLocaleString('id-ID')}
            </div>
            <div className="mt-1 text-[11px] text-gray-400">Total penerimaan kas aktual</div>
          </div>

          <div className="rounded-2xl border border-klinik-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Biaya Token AI</span>
              <Cpu className="h-4 w-4 text-purple-600" />
            </div>
            <div className="mt-2 text-xl font-black text-purple-700">
              Rp {stats.aiCostIdr.toLocaleString('id-ID')}
            </div>
            <div className="mt-1 text-[11px] text-gray-400">Pelacak biaya Gemini real-time</div>
          </div>
        </div>

        {/* Appointments Queue Table */}
        <div className="rounded-2xl border border-klinik-border bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-klinik-primary">
                Antrean Pasien & Jadwal Kedatangan
              </h2>
              <p className="text-xs text-klinik-muted">
                Pilih pasien untuk input data fisik (Lapisan 3) atau jalankan Dewan Pakar AI.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsManualBookingOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-klinik-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-klinik-primaryLight transition"
              >
                <Plus className="h-4 w-4 text-klinik-gold" />
                <span>+ Tambah Jadwal Manual</span>
              </button>

              {/* Filter pills */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {['ALL', 'CONFIRMED', 'BOOKED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      filterStatus === st
                        ? 'bg-klinik-primary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-klinik-primary" />
              <span>Memuat data antrean...</span>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Tidak ada reservasi dengan filter "{filterStatus}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase font-semibold">
                    <th className="py-3 px-3">Jam (WITA)</th>
                    <th className="py-3 px-3">Nama Pasien</th>
                    <th className="py-3 px-3">Sumber</th>
                    <th className="py-3 px-3">WhatsApp</th>
                    <th className="py-3 px-3">Paket</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Kas Masuk</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {filteredAppointments.map((appt) => {
                    const isCompleted = appt.status === 'COMPLETED';
                    const isNoShow = appt.status === 'NO_SHOW';
                    const sourceBadge = getTrafficSourceBadge({
                      utm_campaign: appt.utm_campaign,
                      utm_source: appt.utm_source,
                      utm_content: appt.utm_content,
                      notes: appt.notes,
                    });

                    return (
                      <tr key={appt.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-klinik-primary font-mono">
                            {formatWITATime(appt.slot_start)}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            {new Date(appt.slot_start).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </td>

                        <td className="py-3 px-3 font-semibold text-gray-900">
                          {appt.patients?.full_name || 'Pasien Anonim'}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${sourceBadge.bgClass} ${sourceBadge.textClass} ${sourceBadge.borderClass}`}
                          >
                            {sourceBadge.label}
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono text-gray-600">
                          {appt.patients?.whatsapp || '-'}
                        </td>

                        <td className="py-3 px-3">
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                            {appt.package_type === 'PACKAGE_3X_400K'
                              ? 'Paket 3 Sesi (Rp 400k)'
                              : 'Sesi Awal (Rp 150k)'}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              appt.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : appt.status === 'CONFIRMED'
                                ? 'bg-blue-100 text-blue-800'
                                : appt.status === 'NO_SHOW'
                                ? 'bg-red-100 text-red-800'
                                : appt.status === 'CANCELLED'
                                ? 'bg-gray-100 text-gray-600 line-through'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono font-bold">
                          {appt.amount_paid_idr > 0 ? (
                            <span className="text-emerald-700">
                              Rp {appt.amount_paid_idr.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-gray-400">Belum bayar</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          {/* Edit / Reschedule Button */}
                          <button
                            type="button"
                            onClick={() => setEditingAppointment(appt)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition"
                            title="Edit atau geser jadwal"
                          >
                            <Pencil className="h-3 w-3 text-gray-500" />
                            <span>Edit</span>
                          </button>

                          {/* Complete Button */}
                          {!isCompleted && !isNoShow && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModalAppt(appt);
                                  setModalAmountPaid(
                                    appt.package_type === 'PACKAGE_3X_400K' ? 400000 : 150000
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle className="h-3 w-3" />
                                <span>Selesai</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(appt.id, 'NO_SHOW')}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200"
                              >
                                <XCircle className="h-3 w-3" />
                                <span>No-Show</span>
                              </button>
                            </>
                          )}

                          {/* Open Examination Room */}
                          <button
                            type="button"
                            onClick={() => router.push(`/admin/patients/${appt.patient_id}`)}
                            className="inline-flex items-center gap-1 rounded-lg bg-klinik-primary px-3 py-1 text-[11px] font-bold text-white hover:bg-klinik-primaryLight"
                          >
                            <Sparkles className="h-3 w-3 text-klinik-gold" />
                            <span>Periksa (AI)</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section: Adaptation Alerts (Agent 7) */}
        {adaptationAlerts.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-bold text-amber-950">
                Peringatan Adaptasi Pasien (Agent 7 Monitor)
              </h2>
              <span className="text-xs bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                {adaptationAlerts.length} Pasien Butuh Perhatian
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Pasien berikut terdeteksi memiliki nyeri stagnan/meningkat setelah terapi atau melaporkan skala nyeri tinggi (≥ 8/10).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {adaptationAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-klinik-primary">
                      {alert.patients?.full_name || 'Pasien'}
                    </span>
                    <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-md text-[10px]">
                      Nyeri: {alert.pain_score} / 10
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {alert.ai_adaptation_alert}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px]">
                    <span className="text-gray-400">
                      {formatWITADateTime(alert.logged_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/patients/${alert.patient_id}`)}
                      className="text-klinik-primary font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <span>Lihat Rekam Medis</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section: Internal Reviews (Stars 1-3) */}
        {internalReviews.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-klinik-gold" />
              <h2 className="text-base font-bold text-klinik-primary">
                Masukan & Evaluasi Internal Pasien (Ulasan Bintang 1–3)
              </h2>
            </div>
            <p className="text-xs text-klinik-muted">
              Ulasan dengan rating di bawah bintang 4 ditahan secara internal (tidak diarahkan ke Google Maps) agar dapat ditindaklanjuti secara personal oleh tim klinik.
            </p>

            <div className="space-y-2.5 pt-1">
              {internalReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-gray-800">
                      <span>{rev.patients?.full_name || 'Pasien'}</span>
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[10px]">
                        ★ {rev.rating} / 5
                      </span>
                    </div>
                    <p className="text-gray-600 italic">
                      "{rev.feedback_text || 'Tidak ada catatan tertulis.'}"
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatWITADateTime(rev.created_at)}
                    </p>
                  </div>

                  {rev.patients?.whatsapp && (
                    <a
                      href={`https://wa.me/${rev.patients.whatsapp}?text=Halo%20Bapak%2FIbu%20${encodeURIComponent(
                        rev.patients.full_name || ''
                      )}%2C%20kami%20dari%20Ruang%20Pulih%20Makassar%20menerima%20masukan%20Anda...`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shrink-0"
                    >
                      <span>Hubungi Pasien (WA)</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section: Failed WA Queue Messages */}
        {failedWaQueue.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-base font-bold text-red-950">
                Pesan WhatsApp Gagal Kirim (FAILED)
              </h2>
              <span className="text-xs bg-red-200 text-red-900 font-bold px-2 py-0.5 rounded-full">
                {failedWaQueue.length} Pesan
              </span>
            </div>
            <p className="text-xs text-red-800">
              Pesan berikut gagal dikirimkan secara otomatis setelah 3x percobaan (misal nomor tidak terdaftar atau token habis). Anda dapat menyalin teks dan mengirimkannya manual via WhatsApp.
            </p>

            <div className="space-y-3 pt-1">
              {failedWaQueue.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-red-200 rounded-xl p-4 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-gray-900">
                        {item.patients?.full_name || 'Pasien'} ({item.patients?.whatsapp || '-'})
                      </span>
                      <span className="ml-2 bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                        {item.trigger_type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.message_body);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Salin Pesan</span>
                          </>
                        )}
                      </button>

                      {item.patients?.whatsapp && (
                        <a
                          href={`https://wa.me/${item.patients.whatsapp}?text=${encodeURIComponent(
                            item.message_body
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                        >
                          <span>Kirim Manual (WA)</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-gray-700 font-mono text-[11px] whitespace-pre-wrap max-h-24 overflow-y-auto">
                    {item.message_body}
                  </div>

                  {item.last_error && (
                    <p className="text-[10px] text-red-600">
                      Error: {item.last_error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Completion Modal */}
      {activeModalAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-klinik-border bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-klinik-primary">
              Konfirmasi Selesai Terapi
            </h3>
            <p className="text-xs text-klinik-muted">
              Pasien: <strong>{activeModalAppt.patients?.full_name}</strong>
              <br />
              Mengubah status ke <strong>COMPLETED</strong> akan otomatis menjadwalkan notifikasi WhatsApp ulasan (H+2 jam) dan follow-up klinis (H+3 hari).
            </p>

            <div>
              <label className="text-xs font-semibold block text-gray-700">
                Jumlah Pembayaran Diterima (Rp)
              </label>
              <input
                type="number"
                value={modalAmountPaid}
                onChange={(e) => setModalAmountPaid(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-sm font-mono font-bold text-gray-900 outline-none focus:border-klinik-primary"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModalAppt(null)}
                disabled={isUpdatingStatus}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateStatus(activeModalAppt.id, 'COMPLETED', modalAmountPaid)
                }
                disabled={isUpdatingStatus}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Konfirmasi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Manual Booking Modal */}
      <ManualBookingModal
        isOpen={isManualBookingOpen}
        onClose={() => setIsManualBookingOpen(false)}
        onSuccess={() => {
          fetchDashboardData();
        }}
      />

      {/* Edit / Reschedule Appointment Modal */}
      <EditAppointmentModal
        isOpen={!!editingAppointment}
        appointment={editingAppointment}
        onClose={() => setEditingAppointment(null)}
        onSuccess={() => {
          fetchDashboardData();
        }}
      />
    </div>
  );
}
