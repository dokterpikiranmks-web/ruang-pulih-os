-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 003: DATABASE PERMISSIONS & ROLE ACCESS FIX
-- Lokasi: Jl. Batua Raya 10B No. 9, Makassar (WITA / Asia/Makassar)
-- Description:
-- Grants complete schema usage and table privileges to service_role,
-- authenticated, and anon roles. Prevents PostgreSQL 42501 permission denied
-- errors across API endpoints and edge functions.
-- ==============================================================================

-- 1. SCHEMA USAGE
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;

-- 2. SERVICE ROLE & AUTHENTICATED (ADMIN) FULL ACCESS
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role, authenticated, postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated, postgres;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role, authenticated, postgres;

-- Set default privileges for any future tables created in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, authenticated, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, authenticated, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role, authenticated, postgres;

-- 3. ANON (PUBLIC CLIENT) RESTRICTED GRANTS
-- Leads triage: public can insert triage leads
GRANT SELECT, INSERT ON TABLE leads_triage TO anon;

-- Appointments: public can read active slots to calculate calendar availability
GRANT SELECT ON TABLE appointments TO anon;

-- Patient reviews & feedbacks: public can read reviews and insert feedback
GRANT SELECT, INSERT ON TABLE review_feedbacks TO anon;
GRANT SELECT, INSERT ON TABLE patient_reviews TO anon;

-- Explicitly ensure RLS policies are enabled on all tables
ALTER TABLE IF EXISTS leads_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS patient_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clinical_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wa_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS review_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS patient_reviews ENABLE ROW LEVEL SECURITY;
