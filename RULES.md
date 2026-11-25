# KODE ETIK & ATURAN PENGEMBANGAN RUANG PULIH OS (RULES.md)

## 1. Prinsip Utama & Batasan Fase
1. **Aturan Bertahap (Build-Test-Pass Gate):** Dilarang melompat ke Fase berikutnya sebelum seluruh checklist dan kriteria pada Test-Pass Gate fase aktif lulus 100%.
2. **Batasan Fase 1:** Fokus HANYA pada inisialisasi proyek ringan, skema database Supabase + RLS, utilitas inti (WITA), dan mesin Gemini API auto-detect + IDR tracker. Jangan membangun UI visual (Landing Page, Booking, Admin, PWA) atau 6 agen klinis sebelum Fase 1 lulus.
3. **Kemandirian & Efisiensi Memori (RAM 6 GB Limit):** Hindari dependensi besar atau kompilasi lokal yang berat. Gunakan utilitas standar yang ringan dan modular.

## 2. Keamanan & Kebocoran Rahasia (Zero Secret Leak)
1. **Server-Side Only Secrets:** Variabel lingkungan sensitif (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `FONNTE_TOKEN`, `CRON_SECRET`) HANYA boleh diakses di backend (API routes / server library).
2. **Dilarang Import Admin Client ke Client Components:** `createAdminClient()` di `src/lib/supabase/server.ts` tidak boleh pernah di-import ke komponen dengan direktif `'use client'`.
3. **Data Pasien & Privasi:** Semua data kesehatan klinis dilindungi Row Level Security (RLS) di Supabase.

## 3. Zona Waktu & Waktu Operasional
1. **Zona Waktu Tunggal:** Seluruh logika waktu, kalender slot, dan penjadwalan antrean wajib menggunakan **`Asia/Makassar` (WITA, UTC+8)**.
2. **Penyimpanan Database:** Database menyimpan timestamp dalam `TIMESTAMPTZ` (UTC), dikonversi dan divalidasi ke WITA di lapisan aplikasi.
3. **Aturan Slot:** Sesi 60 menit dengan jeda istirahat 30 menit. Jam operasional default 09:00 - 20:00 WITA.

## 4. Keandalan AI & Anti-Deprecation
1. **Dynamic Model Auto-Detection:** Menggunakan endpoint `listModels` Gemini API untuk mendeteksi model yang aktif secara dinamis, dilengkapi in-memory caching dan fallback berjenjang. Dilarang keras meng-hardcode string versi model yang rawan deprecated.
2. **Strict JSON Parsing:** Parsing response AI wajib melalui pembersihan markdown fence (```` ```json ````) dan divalidasi dengan schema `zod`.
3. **Pelacakan Biaya IDR:** Setiap pemanggilan AI harus mengkalkulasi biaya token ke IDR dan mencatatnya ke `ai_usage_logs` secara fail-safe (kegagalan logging DB tidak boleh membatalkan respons AI utama).

## 5. Integritas Database
1. **Anti Double-Booking:** Wajib mengaktifkan Unique Partial Index:
   ```sql
   CREATE UNIQUE INDEX idx_unique_active_slot ON appointments (slot_start) WHERE status IN ('BOOKED', 'CONFIRMED');
   ```
2. **Row Level Security (RLS):** Diaktifkan di seluruh tabel dengan policy eksplisit.
