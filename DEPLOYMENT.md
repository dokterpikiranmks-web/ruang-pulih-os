# PANDUAN DEPLOYMENT PRODUKSI: RUANG PULIH OS

Aplikasi ini siap di-deploy ke **Vercel** (Frontend & Serverless API), **Supabase** (PostgreSQL Database, Auth & Storage), dan **GitHub Actions** (24/7 WhatsApp Automation Cron).

---

## 1. Persiapan Database Supabase

1. Buka dashboard proyek Supabase Anda: [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Masuk ke **SQL Editor**.
3. Jalankan file migrasi secara berurutan:
   - Salin isi `supabase/migrations/001_initial_schema.sql` lalu jalankan (**Run**).
   - Salin isi `supabase/migrations/002_patient_reviews.sql` lalu jalankan (**Run**).
4. Verifikasi bahwa 10 tabel telah terbentuk dan RLS telah aktif:
   - `leads_triage`
   - `patients`
   - `appointments`
   - `patient_intakes`
   - `clinical_protocols`
   - `progress_logs`
   - `wa_queue`
   - `ai_usage_logs`
   - `review_feedbacks`
   - `patient_reviews`
5. Ambil kredensial di menu **Project Settings -> API**:
   - `Project URL`
   - `anon public key`
   - `service_role key` (Rahasia, khusus backend)

---

## 2. Pengaturan Environment Variables di Vercel

Di dashboard Vercel, buka proyek Anda -> **Settings** -> **Environment Variables**, dan masukkan variabel berikut:

| Nama Variabel | Keterangan / Contoh Nilai |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase Anda (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key (aman untuk browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (terkunci server) |
| `ADMIN_EMAILS` | Email praktisi yang boleh login (`admin@ruangpulihmakassar.com,dokterpikiran@gmail.com`) |
| `GEMINI_API_KEY` | Google Gemini API Key (Pay-as-you-go / Paid tier untuk privasi data medis) |
| `FONNTE_TOKEN` | Token Device resmi dari [Fonnte.com](https://fonnte.com) |
| `CRON_SECRET` | String acak 32+ karakter untuk mengamankan endpoint cron worker |
| `PATIENT_SESSION_SECRET` | String acak 32+ karakter untuk menandatangani HMAC cookie sesi pasien PWA |
| `NEXT_PUBLIC_APP_URL` | Domain produksi (`https://ruangpulihmakassar.com`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` | URL Google Maps Review Ruang Pulih Makassar |
| `NEXT_PUBLIC_META_PIXEL_ID` | ID Meta Pixel klinik untuk pelacakan iklan Facebook/Instagram |
| `USD_TO_IDR_RATE` | `16500` (konversi biaya token IDR) |

---

## 3. Pengaturan GitHub Secrets untuk Cron 24/7

Agar workflow `.github/workflows/wa-cron.yml` dapat memicu pengiriman pesan WhatsApp otomatis setiap 15 menit:

1. Buka repositori GitHub Anda -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Tambahkan **New repository secret**:
   - `APP_URL`: Domain produksi Vercel Anda (misal: `https://ruangpulihmakassar.com`).
   - `CRON_SECRET`: Nilai rahasia yang persis sama dengan yang diisi di Vercel.
3. Masuk ke tab **Actions** di GitHub -> pilih **WhatsApp Automation Worker Cron** -> klik **Run workflow** untuk menguji coba secara manual.

---

## 4. Alur Kerja Pasca-Rilis (Live Operations)

1. **Pasien Baru (Corong 5-Klik & Booking WITA):**
   - Pasien membuka `https://domain.com` -> mengisi 5 pertanyaan triage -> melihat transparansi harga -> memilih tanggal/slot WITA -> submit booking.
   - Otomatis membuat tiket, mengirim antrean WA konfirmasi, dan menyediakan tautan pra-pemeriksaan `/intake/[magic_token]`.

2. **Pra-Pemeriksaan Multimodal (Di Rumah Pasien):**
   - Pasien membuka link `/intake/[magic_token]` -> foto bungkus obat/lab (otomatis dikompresi <150 KB di browser) + rekam suara cerita gejala. Confidence meter naik ke 88%.

3. **Praktisi Klinik (Di Ruang Terapi Makassar):**
   - Praktisi login ke `/admin/login` -> melihat antrean jadwal hari ini -> buka rekam medis pasien -> masukkan data tensi/palpasi fisik Lapisan 3 (Confidence meter naik ke 95%) -> klik **"Jalankan Dewan Pakar AI"** -> 6 Agen AI merumuskan protokol -> Praktisi klik **"Terbitkan ke Aplikasi Pasien"**.

4. **Aplikasi Pasien PWA (`/p/[magic_token]`):**
   - Pasien meng-install ke layar utama HP -> buka dengan PIN 4 digit (4 digit terakhir nomor WhatsApp) -> membaca panduan mandiri, mengisi check-in harian 30 detik (Agent 7 memantau adaptasi nyeri).

5. **Smart Review Gate (`/review/[appointment_id]`):**
   - Pesan WhatsApp follow-up otomatis mengajak pasien memberikan ulasan:
     - Bintang 4–5 diarahkan langsung ke Google Maps klinik.
     - Bintang 1–3 dialihkan ke form masukan internal yang langsung tampil di Dashboard Praktisi `/admin`.
