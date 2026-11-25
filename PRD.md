# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Ruang Pulih OS — End-to-End Clinical Acquisition, Multi-Agent Diagnostic & Retention Engine

**Versi Dokumen:** 1.0 (MVP Produksi — Versi Bootstrap Hemat)
**Entitas Klinik:** Ruang Pulih Makassar / Dokter Pikiran (Totok Saraf & Kedokteran Holistik Integratif)
**Lokasi & Zona Waktu:** Jl. Batua Raya 10B No. 9, Makassar, Sulawesi Selatan (`Asia/Makassar` / WITA, UTC+8)
**Kontak Operasional:** WhatsApp `0811443327` | `ruangpulihmakassar.com`
**Target Operasional Awal:** 5 pasien/hari x 6 hari kerja (~130 pasien/bulan) dengan estimasi biaya infrastruktur ~Rp 145.000/bulan.

---

## 1. Visi Produk & Masalah yang Diselesaikan

### 1.1 Masalah Bisnis & Klinis
1. **Kebocoran Funnel Iklan (High Ghosting & PHP):** Mengarahkan iklan Meta Ads langsung ke WhatsApp memicu banyak chat sekadar tanya harga lalu menghilang, serta pasien yang membuat janji tanpa pemahaman proses terapi (over-ekspektasi sembuh instan sekali datang).
2. **Penanganan Penyakit Kronis yang Parsial:** Mayoritas pasien usia 35–60 tahun dengan kondisi kronis (saraf kejepit, kebas/kesemutan, GERD menahun, hipertensi, gangguan metabolik, insomnia, psikosomatis) selama ini hanya mengobati gejala permukaan, bukan akar masalah lintas domain (metabolik, sistem saraf otonom/pikiran, somatik/struktural, dan nutrisi).
3. **Ketiadaan Monitoring Pasca-Sesi:** Setelah pulang dari klinik, progres pasien tidak tercatat secara objektif sehingga tingkat kelanjutan terapi (*retention*) dan *repeat visit* tidak terukur.

### 1.2 Solusi Terpadu (Ruang Pulih OS)
Membangun satu ekosistem web & PWA cloud-native yang menggabungkan:
1. **Smart Triage Funnel & Self-Booking WITA:** Menyaring calon pasien sebelum memakan slot jadwal praktisi.
2. **Progressive 3-Layer Multimodal Intake:** Mengumpulkan data klinis akurat tanpa membuat pasien usia 35–60 tahun malas mengetik (mendukung foto bungkus obat/hasil lab & rekam suara).
3. **Dewan Pakar AI (6-Agent Clinical Consensus Engine + Agent 7 Monitor):** Sistem multi-agen berbasis bukti ilmiah (*evidence-based*) yang bekerja paralel, saling mengaudit keamanan interaksi obat-herbal, dan wajib diverifikasi praktisi (*Human-in-the-Loop*).
4. **Magic-Link Patient PWA:** Portal sisi pasien tanpa install `.apk` manual dan tanpa email/password, cukup 1 link WA + 4 digit terakhir nomor WA.
5. **AI Lifecycle WhatsApp Automation & Smart Review Gate:** Pengingat otomatis anti-PHP, pelindung reputasi Google Maps, dan *follow-up* klinis H+3.

---

## 2. Arsitektur Teknologi & Batasan Biaya (Bootstrap Cloud-Native)

Aplikasi dikembangkan di perangkat berkapasitas ringan (Windows, RAM 6 GB, tanpa GPU) sehingga **100% cloud-native** dan bebas dependensi berat lokal.

| Lapisan | Teknologi Wajib | Tier / Estimasi Biaya | Alasan Pemilihan |
| :--- | :--- | :--- | :--- |
| **Frontend, API & PWA** | Next.js (App Router), TypeScript, Tailwind CSS | Vercel / Cloudflare Pages (Free) | Ringan, mobile-first, SSR cepat, zero maintenance. |
| **Database, Auth & Storage** | Supabase (PostgreSQL + RLS + Auth + Storage) | Supabase Free (500 MB DB, 1 GB Storage) | Cukup untuk >1,5 tahun operasional dengan kompresi foto <150 KB. |
| **AI Orchestration** | Google Gemini API (Paid Pay-as-you-go Key) | ~Rp 30.000/bulan (Full Flash Auto-Detect) | Wajib Paid Key demi privasi data kesehatan pasien. |
| **WA Automation** | Fonnte REST API (atau WA Gateway kompatibel) | ~Rp 100.000/bulan (flat) | Efisien untuk fase validasi (~30 pesan/hari) dengan jeda kirim acak. |
| **Scheduler / Cron** | GitHub Actions Cron (tiap 15 menit) | Rp 0 (Free) | Berjalan 24/7 di cloud tanpa laptop praktisi menyala. |
| **Tracking Iklan** | Meta Pixel (Browser Events) + Siap CAPI | Rp 0 | Melacak `Lead`, `Schedule`, dan `Purchase` nyata. |

---

## 3. Peran Pengguna & Model Akses

1. **Calon Pasien / Leads (Publik):** Mengakses Landing Page Triage (`/`), melihat analisa awal & harga transparan, menyetujui disclaimer, dan memilih jadwal kosong WITA.
2. **Pasien Terdaftar (Magic-Link + PIN):** Mengakses Pra-Pemeriksaan Mendalam (`/intake/[magic_token]`), Portal PWA Pasien (`/p/[magic_token]`), dan Smart Review Gate (`/review/[appointment_id]`) menggunakan autentikasi ringan **4 digit terakhir nomor WhatsApp (`pin_last4`)**.
3. **Praktisi / Admin Klinik (Authenticated):** Mengakses Dashboard Admin (`/admin`) yang dilindungi **Supabase Auth** + **Row Level Security (RLS)**. Praktisi memiliki kendali penuh atas status kehadiran, input pemeriksaan fisik (Lapisan 3), eksekusi & pengeditan hasil Dewan Pakar AI, penerbitan protokol (`PUBLISHED`), dan pantauan biaya AI (IDR).

---

## 4. Spesifikasi Fungsional Mendalam (7 Modul Inti)

### Modul 1: Smart Triage Landing Page (`/`)
* **Target UX:** Mobile-first, ukuran huruf besar dan kontras tinggi untuk usia 35–60 tahun. Palet warna: Hijau Klinik Tua (`#0D3B2E`), Aksen Emas (`#D4AF37`), latar bersih putih/krem hangat (`#F9FAF8`).
* **Interactive Triage Quiz (1 Pertanyaan per Layar, Tap-to-Advance, Selesai <45 Detik):**
  1. *Keluhan utama yang paling mengganggu saat ini?*
     * Pinggang / Saraf Kejepit
     * Kebas / Kesemutan Kaki-Tangan
     * Leher / Pundak / Migrain
     * GERD / Asam Lambung / Cemas
     * Penyakit Kronis Lainnya (Hipertensi, Metabolik, Insomnia, dll.)
  2. *Sudah berapa lama keluhan ini dirasakan?* (`< 1 bulan`, `1 - 6 bulan`, `Menahun > 6 bulan`)
  3. *Ikhtiar apa yang sudah pernah dicoba?* (`Baru minum obat pereda nyeri`, `Pijat urut biasa tapi kambuh lagi`, `Medis / fisioterapi belum tuntas`)
  4. *Aktivitas apa yang paling terganggu?* (`Sholat & sujud terasa ngilu`, `Tidur malam tidak nyenyak`, `Kerja / duduk lama tersiksa`)
  5. *Kesiapan Anda untuk pemulihan di klinik Makassar?* (`Siap datang & ikut proses bertahap`, `Masih sekadar cari info dulu`)
* **Lead Scoring Otomatis:** Jawaban Q5 memisahkan *Hot Lead* (`readiness_score >= 80`) dan *Cold Lead* (`readiness_score < 50`, diarahkan ke edukasi ringan / tombol konsultasi WA biasa agar tidak menyumbat kalender slot).
* **Halaman Analisa Instan & Price Anchoring (`POST /api/triage/analyze`):**
  * Menggunakan logika **Hybrid** (matriks aturan klinis terstruktur + polesan bahasa empatik Gemini API) dalam <2 detik.
  * Menampilkan: Indikator kondisi, penjelasan akar masalah singkat (2–3 kalimat), rekomendasi terapi & estimasi sesi.
  * Menampilkan **Transparansi Harga:**
    * **Sesi Awal (1x Sesi, 60 Menit):** `Rp 150.000` (Cek titik sumbatan, penguraian awal, evaluasi respon tubuh).
    * **Paket Pemulihan (3x Sesi — Direkomendasikan):** `Rp 400.000` (Lebih hemat, prioritas jadwal, akses penuh monitoring Aplikasi Pasien Ruang Pulih).
  * **Disclaimer Wajib (Anti-Overekspektasi):** Checkbox yang harus dicentang sebelum tombol *"Lihat Jadwal Kosong Terdekat"* aktif:
    > *"Saya memahami bahwa pemulihan saraf dan holistik adalah proses biologis bertahap yang berbeda pada setiap individu, bukan pengobatan instan sekali datang langsung sembuh total."*

### Modul 2: Smart Booking Mandiri (WITA) & Anti-Double Booking
* **Kalender Slot Real-Time (`GET /api/appointments/slots`):**
  * Menampilkan jadwal kosong hari ini hingga 7 hari ke depan dalam zona waktu `Asia/Makassar` (WITA).
  * Jam operasional default: **09:00 – 20:00 WITA**, Senin–Sabtu (Minggu tutup / dapat dikonfigurasi).
  * Durasi sesi: **60 menit** + jeda istirahat terapis **30 menit** antar pasien (slot tersedia misal: 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30).
  * Slot yang sudah berstatus `BOOKED` atau `CONFIRMED` otomatis dinonaktifkan.
* **Form Data Ringkas (`POST /api/appointments/book`):**
  * Input: Nama Lengkap, Usia, Detail Keluhan Singkat, Alamat/Kecamatan di Makassar, Nomor WhatsApp (otomatis normalisasi format `628...`), Pilihan Layanan (Sesi Awal vs Paket 3 Sesi).
  * Membuat/memperbarui record di `patients` (generate `magic_token` acak kriptografis + `pin_last4`).
  * Mengunci slot di `appointments` secara atomik (dilindungi *unique partial index* DB).
  * Langsung memasukkan jadwal notifikasi awal (`BOOKING`, `H_MINUS_1`, `H_MINUS_2H`) ke tabel `wa_queue`.
  * Memicu Meta Pixel Event: `Lead` (saat kuis selesai) dan `Schedule` (saat slot terkunci).

### Modul 3: Progressive 3-Layer Multimodal Intake (`/intake/[magic_token]`)
* **Lapisan 1:** Diambil otomatis dari hasil Triage Landing Page (Skor Keyakinan Analisa awal: **45%**).
* **Lapisan 2 (Diisi Pasien Pasca-Booking di Rumah — Menaikkan Akurasi ke 78%):**
  1. *Keamanan & Red Flag Wajib:* Berat/tinggi badan (BMI), alergi, riwayat operasi/ginjal/liver, hamil/menyusui, dan ceklist **Red Flag Darurat** (nyeri dada menjalar, sesak napas berat, kelemahan/baal mendadak satu sisi tubuh, gangguan kontrol BAB/BAK pada nyeri pinggang, atau risiko melukai diri).
  2. *Zero-Typing Foto Obat & Hasil Lab:* Pasien memotret bungkus obat dokter/herbal dan kertas hasil lab terakhir. Browser mengompres gambar (`canvas`, max width `1024px`, JPEG quality `0.7`, target `< 150 KB`), mengunggah ke Supabase Storage, lalu dikirim ke `POST /api/intake/parse-media` (Gemini Vision) untuk diekstrak menjadi JSON nama obat, dosis, dan angka lab.
  3. *Voice-to-Structured-Data (ATM Timeline):* Pasien dapat memilih mengetik atau merekam suara 1–2 menit (Web Speech API / audio upload ringan) menceritakan kapan keluhan pertama muncul, pemicu awal, dan kejadian berat di sekitar waktu itu. Gemini mengekstrak transkrip ke struktur *Antecedents, Triggers, Mediators*.
  4. *Metabolik, Pencernaan & Tidur:* Jam makan, konsumsi gula/kopi/gorengan, pola BAB/refluks, jam tidur & kualitas bangun tidur.
  5. *Sistem Saraf Otonom & Psikosomatis:* Skala stres 1–10, gejala simpatis dominan (berdebar, napas pendek, tangan dingin, *overthinking*), pola emosi terpendam.
  6. *Peta Somatik & Biomekanik:* Pemilihan area tubuh nyeri/kebas, skala nyeri (1–10), posisi pemicu, dan aktivitas pekerjaan harian.
* **Lapisan 3 (Diisi Praktisi di Klinik dalam 2 Menit — Menaikkan Akurasi ke 95%):**
  * Tanda vital (Tekanan darah, nadi istirahat, pola napas dada vs diafragma), temuan palpasi fisik aktual (titik kompresi/spasme), observasi non-verbal, dan catatan prioritas klinis praktisi.
* **Confidence Meter:** Visualisasi progres kelengkapan data (`45% -> 78% -> 95%`) di layar pasien dan admin.

### Modul 4: "Dewan Pakar AI" — 6-Agent Clinical Consensus Engine
Endpoint utama: `POST /api/agents/synthesize` (hanya bisa dipanggil oleh Admin/Praktisi yang terautentikasi).

#### Arsitektur Eksekusi Modular (`src/lib/agents/`):
1. **`agent0-gatekeeper.ts` (Triage & Matrix Mapper):**
   * Memeriksa Red Flag darurat. Jika terdeteksi `red_flag = true`, **SHORT-CIRCUIT (berhenti total)**: tidak memanggil Agen 1–6, mengembalikan instruksi rujukan segera ke IGD terdekat, dan menandai `red_flag_status = true` di database.
   * Jika aman, menyusun **ATM Timeline** dan **7-Node Functional Matrix** (Pencernaan, Imun, Energi/Mitokondria, Detoksifikasi, Kardiovaskular, Hormon/Saraf, Struktural).
2. **Eksekusi Paralel (`Promise.all()`):**
   * **`agent1-metabolic.ts` (Functional & Metabolic Analyst):** Menganalisis inflamasi kronis, resistensi insulin, *gut-brain axis*, ritme sirkadian, dan angka hasil lab.
   * **`agent2-mindbody.ts` (Mind-Body & PNI Specialist):** Menganalisis ketidakseimbangan saraf otonom (simpatis vs tonus vagal), sumbu HPA/kortisol, beban psikosomatis, serta merancang protokol *vagal toning*, latihan napas, dan arah hipnoterapi.
   * **`agent3-somatic.ts` (Somatic & Totok Saraf Strategist):** Memetakan jalur kompresi saraf, sumbatan mikrosirkulasi, ketegangan myofasial/diafragma, peta titik totok saraf di klinik, dan peregangan aman di rumah.
   * **`agent4-nutrition.ts` (Nutrition & Phytotherapy Architect):** Merancang pola makan anti-inflamasi berbasis bahan pangan lokal Indonesia, jam makan realistis, dan dukungan nutrisi/herbal berbasis bukti beserta mekanismenya.
3. **`agent5-safety.ts` (Clinical Safety & Red-Team Auditor):**
   * Mengaudit seluruh usulan Agen 1–4 terhadap daftar obat dokter pasien, riwayat organ (ginjal/liver), dan kondisi akut (misal larangan *Intermittent Fasting* agresif atau jahe dosis tinggi pada GERD aktif).
   * Memberi label **Lampu Lalu Lintas** untuk setiap rekomendasi:
     * `GREEN`: Aman dijalankan.
     * `YELLOW`: Butuh jeda minimal 2 jam dari obat medis, penyesuaian dosis, atau pemantauan tensi/gula.
     * `RED`: Kontraindikasi keras — wajib dibuang atau diganti.
   * **Aturan Mutlak:** Selalu menyertakan peringatan bahwa pasien **dilarang menghentikan obat resep dokter secara mendadak** tanpa pengawasan dokter yang meresepkan.
4. **`agent6-synthesizer.ts` (Chief Integrative Synthesizer):**
   * Menyelesaikan konflik antar-agen menggunakan loop revisi dengan **Circuit Breaker `MAX_LOOPS = 3`**. Jika pada iterasi ke-3 konflik masih terjadi, item berisiko otomatis dibuang (*fail-safe*) dan diberi tanda catatan untuk tinjauan manual praktisi.
   * Menghasilkan output akhir terstruktur:
     * **4 Skor Domain Awal (0–100):** `nervous_autonomic`, `metabolic_gut`, `recovery_sleep`, `emotional_stress`.
     * **Protokol 3 Fase Realistis (6 Minggu):** Fase 1 (Stabilisasi), Fase 2 (Koreksi Akar), Fase 3 (Kemandirian), agar pasien terhindar dari *protocol fatigue*.
     * **Evidence Tier Wajib pada Setiap Intervensi:** `Tier A` (Uji klinis/meta-analisis kuat), `Tier B` (Studi klinis moderat/observasional), `Tier C` (Komplementer empiris/holistik aman).
     * **Dual-Audience Output:** Catatan Teknis untuk Praktisi + Ringkasan Bahasa Awam yang menenangkan untuk Pasien.
   * Menyimpan ke `clinical_protocols` dengan status wajib **`DRAFT_REVIEW`** (tidak pernah langsung tampil ke pasien tanpa persetujuan praktisi).

### Modul 5: Dashboard Praktisi / Admin (`/admin`)
Dilindungi Supabase Auth (`ADMIN_EMAIL` whitelist / role check).
* **Tab 1 — Antrean & Operasional Harian (WITA):** Daftar pasien jadwal hari ini dan mendatang, status *badge* (`BOOKED`, `CONFIRMED`, `COMPLETED`, `NO_SHOW`, `RESCHEDULED`), tombol 1-klik catat kehadiran & omzet (`amount_paid_idr`), serta tombol salin link intake/PWA pasien.
* **Tab 2 — Ruang Pemeriksaan & Dewan Pakar AI:** Menampilkan hasil kuis Lapisan 1 + Deep Intake Lapisan 2 + Confidence Meter, form cepat input Lapisan 3 (tensi, palpasi, catatan), tombol **"Jalankan Dewan Pakar AI"**, tampilan hasil audit keamanan (`GREEN`/`YELLOW`/`RED`), editor untuk menyunting protokol, dan tombol **"Terbitkan ke Aplikasi Pasien (`PUBLISHED`)"**.
* **Tab 3 — Monitoring Progres & Peringatan Adaptasi:** Menampilkan daftar pasien aktif beserta peringatan dari **Agent 7** jika skor nyeri stagnan/meningkat atau kepatuhan rendah.
* **Tab 4 — Keuangan, Feedback Internal & AI Cost Tracker:** Total omzet aktual, *Show-Up Rate*, daftar masukan internal dari Smart Review Gate (bintang 1–3), serta **Widget Biaya Token Gemini Real-Time (IDR)** harian & bulanan dari `ai_usage_logs`.

### Modul 6: Magic-Link Patient PWA (`/p/[magic_token]`)
Dilengkapi `manifest.json` dan ikon PWA agar pasien bisa klik *"Tambahkan ke Layar Utama"* di Android/iOS.
* **Gerbang Akses Ringan:** Pasien memasukkan 4 digit terakhir nomor WA (`pin_last4`) -> disimpan dalam sesi terenkripsi ringan.
* **4 Tab Utama Pasien:**
  1. **Ringkasan & Peta Akar Masalah:** Penjelasan bahasa awam yang empatik + grafik radar/bar 4 Skor Domain Kesehatan.
  2. **Grafik Progres Pemulihan:** Form *check-in* 30 detik (slider Skala Nyeri 1–10, Kualitas Tidur 1–10, Tingkat Stres 1–10, Kepatuhan Protokol %, catatan singkat) -> menampilkan grafik garis tren pemulihan antar-sesi.
     * **Agent 7 (Progress & Adaptation Monitor):** Setiap pasien melakukan *check-in* baru (atau evaluasi mingguan), sistem memeriksa tren 7 hari terakhir; jika nyeri tidak turun atau memburuk, otomatis mengisi kolom `ai_adaptation_alert` di database untuk dilihat praktisi sebelum sesi berikutnya.
  3. **Protokol Mandiri di Rumah:** Checklist harian yang mudah dicentang (latihan napas, peregangan, pola makan/herbal) lengkap dengan badge keamanan (`GREEN`/`YELLOW`) dan peringatan obat dokter.
  4. **Kartu Sesi & Booking Ulang:** Menampilkan progres paket sesi (misal *Sesi 1 dari 3 selesai*) + tombol 1-klik booking sesi berikutnya.

### Modul 7: Automated WA Lifecycle Worker & Smart Review Gate
* **Endpoint Worker:** `POST /api/cron/process-wa-queue` dilindungi header `Authorization: Bearer ${CRON_SECRET}`.
* **Scheduler:** File `.github/workflows/wa-cron.yml` berjalan otomatis setiap 15 menit (0 rupiah).
* **5 Titik Otomasi WhatsApp (`wa_queue`):**
  1. `BOOKING` (T+0 menit): Tiket booking digital, link Google Maps Jl. Batua Raya 10B No. 9, tips persiapan, dan link Pra-Pemeriksaan (`/intake/[magic_token]`).
  2. `H_MINUS_1` (H-1 jam 19:00 WITA): Konfirmasi kehadiran + link 1-klik *Reschedule* agar slot terbuka kembali jika batal.
  3. `H_MINUS_2H` (2 jam sebelum `slot_start`): Pengingat keberangkatan bahwa ruangan dan terapis sudah siap.
  4. `POST_REVIEW` (2 jam setelah status diubah praktisi ke `COMPLETED`): Ucapan terima kasih, link akses PWA Pasien (`/p/[magic_token]`), dan link **Smart Review Gate** (`/review/[appointment_id]`).
  5. `H_PLUS_3` (3 hari setelah sesi pertama `COMPLETED`): Pesan *follow-up* personal menyebut nama & keluhan awal pasien + ajakan booking sesi lanjutan.
* **Keamanan Pengiriman WA:** Jeda acak `3 - 7 detik` antar pesan, maksimal `retry_count = 3` jika gagal, lalu tandai `FAILED` di dashboard admin.
* **Smart Review Gate (`/review/[appointment_id]`):**
  * Pasien memilih rating bintang 1–5.
  * **Bintang 4 atau 5:** Menyimpan rating dan langsung menampilkan tombol/redirect ke link **Google Maps Review Ruang Pulih Makassar**.
  * **Bintang 1, 2, atau 3:** Tidak mengarahkan ke Google Maps; membuka formulir masukan internal yang masuk ke tabel `review_feedbacks` agar praktisi dapat segera menghubungi dan memperbaiki pelayanan secara pribadi.

---

## 5. Skema Database Inti (Supabase PostgreSQL — 9 Tabel)

Seluruh kolom waktu menggunakan `TIMESTAMPTZ` (disimpan UTC di DB, dikonversi & divalidasi dalam `Asia/Makassar` di lapisan aplikasi).

1. **`leads_triage`:** `id` (UUID PK), `complaint_category` (VARCHAR), `duration` (VARCHAR), `prior_treatments` (JSONB), `disrupted_activity` (VARCHAR), `readiness_score` (INT), `triage_summary` (TEXT), `disclaimer_accepted` (BOOLEAN), `utm_source` (VARCHAR), `utm_campaign` (VARCHAR), `created_at` (TIMESTAMPTZ).
2. **`patients`:** `id` (UUID PK), `full_name` (VARCHAR), `age` (INT), `whatsapp` (VARCHAR UNIQUE), `address` (TEXT), `magic_token` (VARCHAR UNIQUE), `pin_last4` (VARCHAR(4)), `created_at` (TIMESTAMPTZ).
3. **`appointments`:** `id` (UUID PK), `patient_id` (UUID FK -> `patients`), `lead_id` (UUID FK -> `leads_triage` NULLABLE), `slot_start` (TIMESTAMPTZ), `slot_end` (TIMESTAMPTZ), `package_type` (VARCHAR: `SINGLE_150K`, `PACKAGE_3X_400K`), `status` (VARCHAR: `BOOKED`, `CONFIRMED`, `COMPLETED`, `NO_SHOW`, `RESCHEDULED`), `amount_paid_idr` (INT DEFAULT 0), `notes` (TEXT), `created_at` (TIMESTAMPTZ).
   * *Index Kritis:* `CREATE UNIQUE INDEX idx_unique_active_slot ON appointments (slot_start) WHERE status IN ('BOOKED', 'CONFIRMED');`
4. **`patient_intakes`:** `id` (UUID PK), `patient_id` (UUID FK -> `patients`), `red_flag_checklist` (JSONB), `has_red_flag` (BOOLEAN DEFAULT FALSE), `medications_json` (JSONB), `lab_results_json` (JSONB), `media_urls` (JSONB), `atm_timeline_json` (JSONB), `lifestyle_json` (JSONB), `autonomic_mindbody_json` (JSONB), `somatic_pain_map` (JSONB), `voice_transcript` (TEXT), `practitioner_vitals_json` (JSONB), `practitioner_notes` (TEXT), `confidence_score` (INT DEFAULT 45), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
5. **`clinical_protocols`:** `id` (UUID PK), `patient_id` (UUID FK -> `patients`), `intake_id` (UUID FK -> `patient_intakes`), `red_flag_status` (BOOLEAN DEFAULT FALSE), `red_flag_message` (TEXT), `domain_scores_json` (JSONB), `agent_outputs_json` (JSONB), `safety_audit_json` (JSONB), `final_protocol_json` (JSONB), `practitioner_summary` (TEXT), `patient_friendly_summary` (TEXT), `loops_executed` (INT DEFAULT 1), `status` (VARCHAR: `DRAFT_REVIEW`, `PUBLISHED`), `published_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ).
6. **`progress_logs`:** `id` (UUID PK), `patient_id` (UUID FK -> `patients`), `pain_score` (INT), `sleep_score` (INT), `stress_score` (INT), `adherence_pct` (INT), `patient_note` (TEXT), `ai_adaptation_alert` (TEXT), `alert_acknowledged` (BOOLEAN DEFAULT FALSE), `logged_at` (TIMESTAMPTZ).
7. **`wa_queue`:** `id` (UUID PK), `appointment_id` (UUID FK -> `appointments` NULLABLE), `patient_id` (UUID FK -> `patients`), `trigger_type` (VARCHAR: `BOOKING`, `H_MINUS_1`, `H_MINUS_2H`, `POST_REVIEW`, `H_PLUS_3`), `scheduled_for` (TIMESTAMPTZ), `message_body` (TEXT), `status` (VARCHAR: `PENDING`, `SENT`, `FAILED`, `CANCELLED`), `retry_count` (INT DEFAULT 0), `last_error` (TEXT), `sent_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ).
8. **`ai_usage_logs`:** `id` (UUID PK), `endpoint` (VARCHAR), `agent_name` (VARCHAR), `model_name` (VARCHAR), `input_tokens` (INT), `output_tokens` (INT), `cost_idr` (NUMERIC(10,2)), `created_at` (TIMESTAMPTZ).
9. **`review_feedbacks`:** `id` (UUID PK), `appointment_id` (UUID FK -> `appointments`), `patient_id` (UUID FK -> `patients`), `rating` (INT), `comment` (TEXT), `routed_to_gmaps` (BOOLEAN), `created_at` (TIMESTAMPTZ).

---

## 6. Kontrak JSON Ketat — Output Dewan Pakar AI (`POST /api/agents/synthesize`)

```json
{
  "status": "DRAFT_REVIEW",
  "red_flag_detected": false,
  "red_flag_action": null,
  "confidence_score": 88,
  "domain_scores": {
    "nervous_autonomic": 45,
    "metabolic_gut": 52,
    "recovery_sleep": 40,
    "emotional_stress": 38
  },
  "root_cause_matrix": {
    "antecedents": ["Postur duduk kerja >8 jam/hari selama 5 tahun"],
    "triggers": ["Tekanan kerja 4 bulan lalu memicu insomnia & refluks"],
    "mediators": ["Dominasi saraf simpatis & inflamasi metabolik malam hari"]
  },
  "safety_audit": [
    {
      "item": "Ekstrak Jahe Dosis Tinggi",
      "traffic_light": "YELLOW",
      "reason": "Berpotensi mengiritasi mukosa lambung pada GERD aktif; ganti dengan ekstrak kunyit lembut & beri jeda 2 jam dari Omeprazole."
    }
  ],
  "protocol_phases": [
    {
      "phase": 1,
      "title": "Minggu 1-2: Stabilisasi Saraf & Redakan Kompresi",
      "clinic_therapy": "Totok saraf titik torakal T5-T9, diafragma, & lumbar L4-L5",
      "home_care": [
        "Napas diafragma 4-7-8 selama 5 menit sebelum tidur",
        "Hentikan makan berat minimal 3 jam sebelum tidur"
      ],
      "evidence_tier": "Tier A"
    }
  ],
  "practitioner_summary": "Ringkasan teknis klinis untuk praktisi...",
  "patient_friendly_summary": "Ringkasan bahasa awam yang empatik untuk PWA pasien...",
  "meta": {
    "loops_executed": 1,
    "model_used": "gemini-auto-detected",
    "total_cost_idr": 420.50
  }
}
```

---

## 7. Matriks Skenario Ekstrem (*Edge Cases*)

| Skenario | Penanganan Sistem Wajib |
| :--- | :--- |
| **Red Flag Darurat Terdeteksi** | Agent 0 memutus rantai (*short-circuit*), Agen 1–6 tidak dijalankan, layar menampilkan kartu darurat rujukan IGD terdekat, `red_flag_status = true`. |
| **Konflik Obat-Herbal Berulang (Loop)** | Circuit breaker `MAX_LOOPS = 3` antara Agent 5 & Agent 6. Pada iterasi ke-3, item pemicu konflik dibuang (*fail-safe*) dan diberi peringatan manual untuk praktisi. |
| **Double Booking Slot Bersamaan** | Partial unique index DB menolak request kedua dengan HTTP `409 Conflict`; UI otomatis me-refresh daftar slot kosong WITA dan meminta pasien memilih jam lain. |
| **Model Gemini Deprecated / Rate Limit** | Modul `src/lib/gemini/client.ts` mendeteksi model aktif secara dinamis dari Gemini API dengan daftar prioritas fallback otomatis tanpa crash. |
| **Foto Lab/Obat Ukuran Besar (>5 MB)** | Kompresi otomatis di sisi client browser (`canvas` max 1024px, JPEG 0.7 -> target <150 KB) sebelum upload ke Supabase Storage. |
| **WA Gateway Gagal / Timeout** | Worker `wa-cron` menaikkan `retry_count` (maksimal 3 kali percobaan), mencatat `last_error`, dan menandai `FAILED` agar muncul peringatan di Dashboard Admin. |
