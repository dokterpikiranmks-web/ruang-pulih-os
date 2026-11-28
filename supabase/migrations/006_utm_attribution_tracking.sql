-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 006: UTM ATTRIBUTION & META PIXEL TRACKING
-- Lokasi: Jl. Batua Raya 10B No. 9, Makassar (WITA / Asia/Makassar)
-- Description:
-- Menambahkan kolom UTM dan FBCLID pada tabel leads_triage dan appointments
-- untuk melacak atribusi Meta Ads (Facebook & Instagram) dan sumber trafik pasien.
-- ==============================================================================

-- 1. Tambah kolom UTM & FBCLID pada tabel leads_triage jika belum ada
ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS utm_content VARCHAR(100);
ALTER TABLE leads_triage ADD COLUMN IF NOT EXISTS fbclid TEXT;

-- 2. Tambah kolom UTM & FBCLID pada tabel appointments jika belum ada
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS utm_content VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fbclid TEXT;

-- 3. Performance Indexes untuk reporting kampanye iklan
CREATE INDEX IF NOT EXISTS idx_leads_triage_utm_campaign ON leads_triage(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_appointments_utm_campaign ON appointments(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_appointments_utm_source ON appointments(utm_source);

-- 4. Pastikan hak akses & sinkronisasi schema PostgREST
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated, postgres;
GRANT SELECT, INSERT ON TABLE leads_triage TO anon;
GRANT SELECT, INSERT ON TABLE appointments TO anon;

NOTIFY pgrst, 'reload schema';
