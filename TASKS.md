# MASTER DEVELOPMENT TASKS & MANDATORY TEST-PASS GATES
## Proyek: Ruang Pulih OS (`ruang-pulih-os`)

> **ATURAN WAJIB EKSEKUSI:**
> Pengembangan dilakukan secara bertahap (**Fase 1 hingga Fase 6**). AI Developer **DILARANG KERAS** melanjutkan ke Fase `N+1` sebelum seluruh checklist implementasi **DAN** seluruh kriteria pada **MANDATORY TEST-PASS GATE** di Fase `N` lulus 100% tanpa error. Setiap kali sebuah task atau gate selesai, wajib perbarui tanda `[ ]` menjadi `[x]` di file ini.

---

## FASE 1: Fondasi Proyek, Database Supabase & Gemini Auto-Model Core
**Target:** Struktur proyek bersih, 9 tabel Supabase siap migrasi, modul Gemini anti-deprecated + pelacak biaya IDR berjalan.

### Daftar Tugas (Build)
- [x] Inisialisasi proyek Next.js (App Router, TypeScript, Tailwind CSS) dengan konfigurasi ringan dan palet brand Ruang Pulih (`#0D3B2E`, `#D4AF37`, `#F9FAF8`).
- [x] Buat `.env.example` lengkap (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `FONNTE_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GMAPS_REVIEW_URL`, `ADMIN_EMAILS`).
- [x] Buat helper Supabase client (`src/lib/supabase/client.ts`, `server.ts`, `admin.ts`) dan utilitas zona waktu WITA (`src/lib/time/wita.ts` menggunakan `Asia/Makassar`).
- [x] Buat file migrasi SQL lengkap (`supabase/migrations/001_initial_schema.sql`) berisi 9 tabel sesuai `PRD.md`, partial unique index anti double-booking (`idx_unique_active_slot`), dan kebijakan RLS dasar.
- [x] Bangun modul `src/lib/gemini/client.ts` yang mencakup:
  - Auto-Model Detection dinamis (memilih model aktif terbaik kelas Flash/Pro + fallback otomatis tanpa hardcode model mati).
  - Wrapper `callGeminiJSON<T>()` dengan validasi parsing JSON ketat.
  - Pencatatan otomatis `input_tokens`, `output_tokens`, dan konversi biaya ke **IDR** langsung ke tabel `ai_usage_logs`.
- [x] Buat endpoint uji kesehatan sistem (`GET /api/health`) untuk memverifikasi koneksi env, deteksi model Gemini, dan waktu WITA.

### MANDATORY TEST-PASS GATE — FASE 1
- [x] **Build Gate:** `npm run build` dan `npx tsc --noEmit` lulus dengan **0 error**.
- [x] **SQL Gate:** File `001_initial_schema.sql` bersih dari syntax error dan telah diverifikasi mencakup 9 tabel + `idx_unique_active_slot` + RLS enabled di semua tabel.
- [x] **Gemini Core Gate:** Pengujian unit/endpoint membuktikan Auto-Model Detector berhasil menemukan model aktif, mengembalikan JSON valid, dan mencatat 1 baris biaya IDR ke `ai_usage_logs` (atau lulus mock test jika env belum diisi).
- [x] **GATE 1 PASSED** *(Siap lanjut ke Fase 2)*

---

## FASE 2: Smart Triage Landing Page & Analisa Instan Hybrid
**Target:** Corong akuisisi 5-klik ramah usia 35–60 tahun, analisa akar masalah instan, *price anchoring*, dan *disclaimer* wajib.

### Daftar Tugas (Build)
- [x] Bangun komponen Landing Page (`/`) dengan desain mobile-first, tipografi besar/mudah dibaca, dan alur kuis **1 pertanyaan per layar** (5 pertanyaan sesuai `PRD.md`, tanpa mengetik).
- [x] Implementasikan perhitungan *Lead Scoring* otomatis (memisahkan *Hot Lead* siap datang vs *Cold Lead* sekadar cari info).
- [x] Bangun endpoint `POST /api/triage/analyze`:
  - Simpan jawaban ke tabel `leads_triage` (termasuk tangkapan parameter `utm_source` & `utm_campaign` dari URL iklan Meta).
  - Gabungkan matriks aturan klinis terstruktur + polesan bahasa empatik dari Gemini API (`callGeminiJSON`).
- [x] Bangun halaman/view Hasil Analisa Instan:
  - Indikator kondisi, penjelasan akar masalah singkat, estimasi jumlah sesi.
  - Kartu transparansi harga: **Sesi Awal (Rp 150.000 / 60 Menit)** vs **Paket Pemulihan 3 Sesi (Rp 400.000)**.
  - **Checkbox Disclaimer Wajib:** tombol *"Lihat Jadwal Kosong Terdekat"* terkunci (`disabled`) sebelum dicentang.
- [x] Pasang komponen Meta Pixel (`src/components/MetaPixel.tsx`) dengan trigger event `PageView` dan `Lead` saat kuis selesai.

### MANDATORY TEST-PASS GATE — FASE 2
- [x] **Build Gate:** `npm run build` dan `npx tsc --noEmit` lulus dengan **0 error**.
- [x] **UX & Disclaimer Gate:** Uji simulasi 5 klik selesai <45 detik di viewport mobile (`375px`); tombol lanjut **terbukti terkunci** jika checkbox disclaimer belum dicentang.
- [x] **Cold vs Hot Lead Gate:** Memilih "Masih sekadar cari info dulu" di Q5 memunculkan jalur edukasi/WA ringan, bukan langsung memblokir slot kalender.
- [x] **Data Persistence Gate:** Data kuis & `triage_summary` tersimpan valid di `leads_triage` dan biaya token tercatat di `ai_usage_logs`.
- [x] **GATE 2 PASSED** *(Siap lanjut ke Fase 3)*

---

## FASE 3: Smart Booking Mandiri (WITA) & Antrean WA Awal
**Target:** Kalender slot WITA real-time anti-bentrok dan pencatatan otomatis ke database + antrean WA.

### Daftar Tugas (Build)
- [x] Bangun endpoint `GET /api/appointments/slots` yang menghasilkan daftar slot kosong hari ini s/d 7 hari ke depan dalam `Asia/Makassar` (09:00–20:00 WITA, sesi 60 menit + jeda istirahat 30 menit, mengecualikan slot `BOOKED`/`CONFIRMED` dan waktu yang sudah lewat).
- [x] Bangun UI pemilihan tanggal, jam WITA, pilihan paket (`SINGLE_150K` / `PACKAGE_3X_400K`), dan form data diri ringkas (Nama, Usia, Keluhan Utama, Alamat Makassar, No WA).
- [x] Bangun endpoint `POST /api/appointments/book`:
  - Normalisasi nomor WA ke format `628...` dan ambil 4 digit terakhir sebagai `pin_last4`.
  - Buat/update data di `patients` dengan `magic_token` acak kriptografis.
  - Insert jadwal ke `appointments`; tangani error duplikasi slot dengan HTTP `409 Conflict` yang ramah di UI.
  - Otomatis memasukkan 3 antrean awal ke `wa_queue`: `BOOKING` (segera), `H_MINUS_1` (H-1 jam 19:00 WITA), dan `H_MINUS_2H` (2 jam sebelum sesi).
- [x] Bangun halaman Konfirmasi Booking Sukses berisi ringkasan tiket, lokasi Jl. Batua Raya 10B No. 9, tombol langsung ke Pra-Pemeriksaan (`/intake/[magic_token]`), dan picu Meta Pixel event `Schedule`.
- [x] Bangun halaman Reschedule 1-klik (`/reschedule/[appointment_id]`) agar pasien yang berhalangan bisa memindah jadwal dan otomatis membuka kembali slot lama serta membatalkan/memperbarui antrean WA terkait.

### MANDATORY TEST-PASS GATE — FASE 3
- [x] **Build Gate:** `npm run build` dan `npx tsc --noEmit` lulus dengan **0 error**.
- [x] **Timezone Gate:** Seluruh tampilan dan penyimpanan slot akurat sesuai `Asia/Makassar` (WITA), tidak bergeser ke UTC atau WIB.
- [x] **Anti-Double Booking Gate:** Simulasi 2 permintaan booking di `slot_start` yang sama menghasilkan 1 sukses (`201`) dan 1 ditolak aman (`409 Conflict`) tanpa crash.
- [x] **Queue Integrity Gate:** 1 booking berhasil otomatis menciptakan 3 baris valid (`BOOKING`, `H_MINUS_1`, `H_MINUS_2H`) di `wa_queue` dan `magic_token` di `patients`.
- [x] **GATE 3 PASSED** *(Siap lanjut ke Fase 4)*

---

## FASE 4: Deep Intake Multimodal & "Dewan Pakar AI" (6 Agen Modular)
**Target:** Pra-pemeriksaan mudah (foto obat/lab terkompresi + suara) dan orkestrasi 6 Agen AI dengan Safety Auditor & Circuit Breaker.

### Daftar Tugas (Build)
- [x] Bangun halaman `/intake/[magic_token]` dengan verifikasi `pin_last4`, **Confidence Meter** dinamis (45% -> 78%), dan formulir terstruktur Lapisan 2 (Red Flag Checklist, Obat & Lab, ATM Timeline, Metabolik/Tidur, Saraf Otonom/Stres, Peta Nyeri 1–10).
- [x] Implementasikan kompresi foto di sisi browser (`src/lib/utils/image-compress.ts`, max width 1024px, JPEG 0.7, target `<150 KB`) + endpoint `POST /api/intake/extract-vision` (Gemini Vision untuk ekstrak JSON obat & angka lab).
- [x] Implementasikan fitur rekam suara ringan (`Voice-to-Structured-Data`) menggunakan Web Speech API (bahasa `id-ID`) dengan fallback teks, diproses ke struktur ATM Timeline.
- [x] Bangun 7 file agen modular di `src/lib/agents/` (1 file per agen, dilarang digabung):
  - `types.ts` (kontrak TypeScript ketat antar-agen).
  - `agent0-gatekeeper.ts` (Deteksi Red Flag + Short-Circuit + ATM & 7-Node Matrix).
  - `agent1-metabolic.ts` (Functional & Metabolic Root).
  - `agent2-mindbody.ts` (Mind-Body, PNI & Autonomic).
  - `agent3-somatic.ts` (Somatic & Totok Saraf).
  - `agent4-nutrition.ts` (Nutrition & Phytotherapy Lokal).
  - `agent5-safety.ts` (Clinical Safety Auditor — `GREEN`/`YELLOW`/`RED` + larangan stop obat dokter).
  - `agent6-synthesizer.ts` (Chief Synthesizer — 3 Fase, 4 Skor Domain, Evidence Tier A/B/C, Dual Summary).
- [x] Bangun orkestrator `POST /api/agents/synthesize`:
  - Jalankan Agent 0 -> jika Red Flag, hentikan eksekusi (*short-circuit*).
  - Jalankan Agent 1–4 paralel via `Promise.all()`.
  - Jalankan Agent 5 -> Agent 6 dengan loop revisi **Circuit Breaker `MAX_LOOPS = 3`** (*fail-safe* buang item berisiko jika loop 3 masih konflik).
  - Simpan hasil ke `clinical_protocols` berstatus **`DRAFT_REVIEW`**.

### MANDATORY TEST-PASS GATE — FASE 4
- [x] **Build Gate:** `npm run build` dan `npx tsc --noEmit` lulus dengan **0 error**.
- [x] **Compression Gate:** Upload gambar uji >2 MB terbukti terkompresi di browser menjadi `<150 KB` sebelum menyentuh Supabase Storage.
- [x] **Red-Flag Short-Circuit Gate:** Input skenario pasien dengan Red Flag (misal nyeri dada menjalar / gangguan kontrol BAB-BAK) mengembalikan `red_flag_detected: true` dengan rujukan IGD dan **0 pemanggilan** terhadap Agen 1–6.
- [x] **Safety & Circuit Breaker Gate:** Input skenario pasien GERD + Hipertensi (minum Amlodipine & Omeprazole) menghasilkan JSON valid lengkap dengan label `YELLOW`/`RED`, peringatan larangan stop obat dokter, `loops_executed <= 3`, Evidence Tier, dan status `DRAFT_REVIEW`.
- [x] **GATE 4 PASSED** *(Siap lanjut ke Fase 5)*

---

## FASE 5: Dashboard Praktisi (`/admin`) & Magic-Link Patient PWA (`/p/[magic_token]`)
**Target:** Kendali Human-in-the-Loop di sisi klinik dan aplikasi pasien yang bisa di-install ke layar utama HP.

### Daftar Tugas (Build)
- [x] Bangun autentikasi praktisi (`/admin/login`) memakai Supabase Auth + proteksi middleware & verifikasi email whitelist (`ADMIN_EMAILS`).
- [x] Bangun Dashboard Praktisi (`/admin`) dengan 4 Tab operasional:
  - Antrean jadwal WITA + tombol ubah status (`CONFIRMED`, `COMPLETED` + input `amount_paid_idr`, `NO_SHOW`). Mengubah status ke `COMPLETED` otomatis mengantrekan pesan `POST_REVIEW` (+2 jam) dan `H_PLUS_3` (+3 hari) ke `wa_queue`.
  - Panel Pemeriksaan Pasien: lihat Lapisan 1 & 2, input Lapisan 3 (tensi, nadi, palpasi fisik, catatan klinis -> Confidence Meter naik ke 95%), tombol **"Jalankan Dewan Pakar AI"**, editor draft protokol, dan tombol **"Terbitkan ke Aplikasi Pasien (`PUBLISHED`)"**.
  - Panel Peringatan Adaptasi (Agent 7) & Daftar Masukan Internal (bintang 1–3).
  - Widget **Total Biaya Token AI (IDR)** bulan berjalan & metrik *Show-Up Rate* / Omzet nyata.
- [x] Konfigurasikan PWA (`public/manifest.json`, ikon aplikasi Ruang Pulih, meta tags iOS/Android).
- [x] Bangun Portal Pasien (`/p/[magic_token]`) dengan verifikasi `pin_last4` dan 4 Tab utama:
  1. Ringkasan Akar Masalah & Visualisasi 4 Skor Domain (hanya tampil jika status `PUBLISHED`).
  2. Grafik Progres Pemulihan + Form Check-In 30 Detik (`POST /api/patient/progress`) + logika **Agent 7** untuk mendeteksi nyeri stagnan/meningkat dan menulis `ai_adaptation_alert`.
  3. Protokol Mandiri di Rumah (checklist interaktif + badge keamanan `GREEN`/`YELLOW` + disclaimer obat dokter).
  4. Kartu Sesi & tombol Booking Ulang 1-Klik.

### MANDATORY TEST-PASS GATE — FASE 5
- [x] **Build Gate:** `npm run build` dan `npx tsc --noEmit` lulus dengan **0 error**.
- [x] **RBAC & Auth Gate:** Akses ke `/admin` dan `/api/agents/synthesize` tanpa sesi admin ditolak (`401`/`302`). Akses `/p/[magic_token]` dengan PIN salah ditolak (`401`).
- [x] **Human-in-the-Loop Gate:** Protokol berstatus `DRAFT_REVIEW` **tidak boleh muncul** di PWA Pasien; baru muncul setelah praktisi klik tombol *Publish*.
- [x] **Progress & Agent 7 Gate:** Submit check-in pasien di PWA memperbarui grafik secara real-time; simulasi skor nyeri naik/stagnan memicu peringatan di tab monitoring Dashboard Admin.
- [x] **GATE 5 PASSED** *(Siap lanjut ke Fase 6)*

---

## FASE 6: Worker Otomasi WA, Smart Review Gate & Audit Produksi Akhir
**Target:** Otomasi WA berjalan 24/7 via GitHub Actions, pelindung reputasi Google Maps aktif, dan aplikasi siap deploy produksi.

### Daftar Tugas (Build)
- [x] Bangun Smart Review Gate (`/review/[appointment_id]` + `POST /api/review/submit`):
  - Rating 4–5 bintang -> simpan ke `patient_reviews` (`routed_to_gmaps = true`) dan arahkan ke `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`.
  - Rating 1–3 bintang -> simpan ke `patient_reviews` (`routed_to_gmaps = false`) dan tampilkan form masukan internal untuk ditindaklanjuti praktisi.
- [x] Bangun endpoint Cron Worker (`POST /api/cron/process-wa-queue`):
  - Wajib validasi header `Authorization: Bearer ${CRON_SECRET}`.
  - Ambil antrean `wa_queue` di mana `status = 'PENDING'` dan `scheduled_for <= NOW()` (limit batch aman, misal 5 pesan per eksekusi).
  - Kirim via REST API Fonnte (`src/lib/wa/fonnte.ts`) dengan parameter delay `3-7`.
  - Tangani sukses (`SENT`, isi `sent_at`) dan kegagalan (naikkan `retry_count`; jika `>= 3`, ubah ke `FAILED` + simpan `last_error`).
- [x] Buat file workflow `.github/workflows/wa-cron.yml` dengan jadwal `*/15 * * * *` dan opsi `workflow_dispatch` untuk uji manual.
- [x] Lakukan Audit Keamanan & Produksi Akhir: pastikan tidak ada API Key rahasia (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `FONNTE_TOKEN`, `CRON_SECRET`, `PATIENT_SESSION_SECRET`) yang terbawa ke client bundle.
- [x] Susun panduan singkat `DEPLOYMENT.md` (langkah isi Environment Variables di Vercel, eksekusi SQL di Supabase, dan setting GitHub Secrets untuk Cron).

### MANDATORY TEST-PASS GATE — FASE 6 (FINAL PRODUCTION RELEASE)
- [x] **Build & Lint Gate:** `npm run build`, `npx tsc --noEmit` lulus 100% tanpa error.
- [x] **Cron Security Gate:** Request ke `/api/cron/process-wa-queue` tanpa token `CRON_SECRET` ditolak dengan HTTP `401 Unauthorized`.
- [x] **Smart Review Gate:** Uji bintang 5 mengarah ke link Google Maps; uji bintang 2 membuka form internal dan muncul di Dashboard Admin.
- [x] **End-to-End Dry Run:** Simulasi utuh dari Landing Page -> Booking WITA -> WA Queue -> Intake Foto Obat -> 6 Agen AI -> Publish Admin -> PWA Pasien -> Selesai Sesi berjalan mulus tanpa error konsol.
- [x] **Secret Leak Audit:** Hasil grep/inspeksi memastikan 0 kunci rahasia berada di folder komponen client atau file publik.
- [x] **FINAL GATE PASSED — SIAP DEPLOY PRODUKSI**
