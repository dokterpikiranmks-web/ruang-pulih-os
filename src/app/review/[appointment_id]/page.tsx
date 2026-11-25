'use client';

import { useState, use } from 'react';
import {
  Star,
  CheckCircle2,
  Heart,
  MessageSquare,
  ArrowRight,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export default function SmartReviewPage({
  params,
}: {
  params: Promise<{ appointment_id: string }>;
}) {
  const resolvedParams = use(params);
  const appointmentId = resolvedParams.appointment_id;

  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [routedToGmaps, setRoutedToGmaps] = useState(false);
  const [gmapsUrl, setGmapsUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRating === 0) {
      alert('Silakan pilih jumlah bintang terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          rating: selectedRating,
          feedback_text: feedbackText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsSubmitted(true);
        setRoutedToGmaps(data.routed_to_gmaps);
        if (data.routed_to_gmaps && data.gmaps_url) {
          setGmapsUrl(data.gmaps_url);
        }
      } else {
        alert(data.error || 'Gagal mengirim ulasan.');
      }
    } catch {
      alert('Terjadi kesalahan koneksi saat mengirim ulasan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-klinik-bg flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-xl border border-gray-100 text-center">
        {/* Header */}
        <div className="w-16 h-16 bg-klinik-gold/15 rounded-2xl flex items-center justify-center mx-auto mb-3 text-klinik-gold">
          <Heart className="w-8 h-8 fill-klinik-gold text-klinik-gold" />
        </div>

        <h1 className="text-2xl font-bold font-serif text-klinik-primary mb-1">
          Bagaimana Sesi Terapi Anda?
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          Klinik Ruang Pulih Makassar • Totok Saraf & Kedokteran Holistik
        </p>

        {/* Success View */}
        {isSubmitted ? (
          <div className="space-y-4 py-4 animate-in fade-in duration-500">
            {routedToGmaps ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-900">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold font-serif text-base mb-1">
                  Terima Kasih Banyak!
                </h3>
                <p className="text-xs leading-relaxed mb-4">
                  Senang sekali sesi terapi kami memberikan kenyamanan dan kebaikan bagi tubuh Anda. Ulasan positif Anda di Google Maps sangat membantu warga Makassar lainnya menemukan jalan pemulihan holistik.
                </p>

                {gmapsUrl && (
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-klinik-gold hover:bg-klinik-gold/90 text-klinik-primary font-bold rounded-2xl text-xs transition-all shadow-md inline-flex items-center justify-center gap-2"
                  >
                    <span>Tulis Ulasan di Google Maps Sekarang</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900 text-left">
                <div className="flex items-center gap-2 font-bold mb-2 text-amber-800">
                  <MessageSquare className="w-5 h-5 shrink-0" />
                  <span>Masukan Internal Diterima</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Terima kasih atas ketulusan masukan Anda. Pesan ini telah langsung diteruskan ke meja Praktisi Utama Ruang Pulih Makassar untuk evaluasi dan perbaikan kualitas terapi kami. Praktisi kami akan menghubungi Anda jika diperlukan.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Star Selection Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 5 Big Stars */}
            <div className="flex justify-center items-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setSelectedRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1.5 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      (hoverRating || selectedRating) >= star
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {selectedRating > 0 && (
              <div className="text-xs font-semibold text-gray-600 animate-in fade-in">
                {selectedRating === 5 && '🌟 Luar Biasa Nyaman & Bermanfaat!'}
                {selectedRating === 4 && '👍 Sangat Bagus & Membantu'}
                {selectedRating === 3 && '😐 Cukup, Perlu Beberapa Peningkatan'}
                {selectedRating === 2 && '🙁 Kurang Memuaskan'}
                {selectedRating === 1 && '⚠️ Sangat Mengecewakan'}
              </div>
            )}

            {/* Dynamic Feedback Input */}
            {selectedRating > 0 && (
              <div className="animate-in fade-in duration-300">
                {selectedRating <= 3 ? (
                  <div className="text-left space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Sampaikan Keluhan / Saran Anda Langsung ke Praktisi:
                    </label>
                    <textarea
                      rows={4}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Tuliskan bagian mana yang terasa kurang nyaman atau perlu kami perbaiki..."
                      className="w-full text-xs p-3 border border-gray-200 rounded-2xl focus:border-klinik-primary outline-none"
                      required
                    />
                  </div>
                ) : (
                  <div className="text-left space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Ceritakan Apa yang Paling Anda Rasakan Pasca Terapi: (Opsional)
                    </label>
                    <textarea
                      rows={3}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Misal: Badan terasa jauh lebih enteng dan leher tidak tegang lagi..."
                      className="w-full text-xs p-3 border border-gray-200 rounded-2xl focus:border-klinik-primary outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            {selectedRating > 0 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-klinik-primary hover:bg-klinik-primary/95 text-white font-bold rounded-2xl text-xs transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : selectedRating >= 4 ? (
                  <>
                    <span>Lanjutkan Ulasan Bintang {selectedRating}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <span>Kirim Masukan Internal ke Praktisi</span>
                )}
              </button>
            )}
          </form>
        )}

        <div className="mt-7 pt-4 border-t border-gray-100 text-[11px] text-gray-400">
          Ruang Pulih Makassar • Jl. Batua Raya 10B No. 9, Makassar (WITA)
        </div>
      </div>
    </div>
  );
}
