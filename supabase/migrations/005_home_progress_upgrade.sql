-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 005: HOME PROGRESS UPGRADE
-- Mendukung pencatatan Tensi (BP), Gula Darah, Checklist Habits,
-- dan Penjadwalan Pesan Pengingat Mingguan (WEEKLY_CHECKIN H+7).
-- ==============================================================================

-- 1. Tambah kolom pengukuran mandiri di rumah pada tabel progress_logs
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS systolic_bp INT;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS diastolic_bp INT;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS blood_sugar_mgdl INT;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS blood_sugar_context TEXT;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS completed_habits_json JSONB DEFAULT '[]'::jsonb;

-- 2. Perbarui CHECK constraint wa_queue.trigger_type untuk mendukung 'WEEKLY_CHECKIN'
ALTER TABLE wa_queue DROP CONSTRAINT IF EXISTS wa_queue_trigger_type_check;
ALTER TABLE wa_queue ADD CONSTRAINT wa_queue_trigger_type_check 
  CHECK (trigger_type IN ('BOOKING', 'H_MINUS_1', 'H_MINUS_2H', 'POST_REVIEW', 'H_PLUS_3', 'WEEKLY_CHECKIN'));

-- 3. Pastikan izin akses service_role & reload schema PostgREST
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
