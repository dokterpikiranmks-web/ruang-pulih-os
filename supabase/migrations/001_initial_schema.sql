-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 001: INITIAL SCHEMA & ROW LEVEL SECURITY
-- Lokasi: Jl. Batua Raya 10B No. 9, Makassar (WITA / Asia/Makassar)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE DEFINITIONS
-- ==============================================================================

-- 1. LEADS TRIAGE
CREATE TABLE IF NOT EXISTS leads_triage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_category VARCHAR(100),
    duration VARCHAR(50),
    prior_treatments JSONB DEFAULT '[]'::jsonb,
    disrupted_activity VARCHAR(255),
    readiness_score INT DEFAULT 0,
    triage_summary TEXT,
    disclaimer_accepted BOOLEAN DEFAULT FALSE,
    utm_source VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. PATIENTS
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    age INT,
    whatsapp VARCHAR(20) NOT NULL UNIQUE,
    address TEXT,
    magic_token VARCHAR(64) NOT NULL UNIQUE,
    pin_last4 VARCHAR(4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads_triage(id) ON DELETE SET NULL,
    slot_start TIMESTAMPTZ NOT NULL,
    slot_end TIMESTAMPTZ NOT NULL,
    package_type VARCHAR(50) NOT NULL DEFAULT 'SINGLE_150K' CHECK (package_type IN ('SINGLE_150K', 'PACKAGE_3X_400K')),
    status VARCHAR(50) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED')),
    amount_paid_idr INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- UNIQUE PARTIAL INDEX ANTI-DOUBLE BOOKING (MANDATORY)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_slot 
ON appointments (slot_start) 
WHERE status IN ('BOOKED', 'CONFIRMED');

-- 4. PATIENT INTAKES (3-LAYER MULTIMODAL INTAKE)
CREATE TABLE IF NOT EXISTS patient_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    red_flag_checklist JSONB DEFAULT '[]'::jsonb,
    has_red_flag BOOLEAN NOT NULL DEFAULT FALSE,
    medications_json JSONB DEFAULT '[]'::jsonb,
    lab_results_json JSONB DEFAULT '[]'::jsonb,
    media_urls JSONB DEFAULT '[]'::jsonb,
    atm_timeline_json JSONB DEFAULT '{}'::jsonb,
    lifestyle_json JSONB DEFAULT '{}'::jsonb,
    autonomic_mindbody_json JSONB DEFAULT '{}'::jsonb,
    somatic_pain_map JSONB DEFAULT '{}'::jsonb,
    voice_transcript TEXT,
    practitioner_vitals_json JSONB DEFAULT '{}'::jsonb,
    practitioner_notes TEXT,
    confidence_score INT NOT NULL DEFAULT 45,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. CLINICAL PROTOCOLS (6-AGENT CONSENSUS & DUAL-AUDIENCE)
CREATE TABLE IF NOT EXISTS clinical_protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    intake_id UUID REFERENCES patient_intakes(id) ON DELETE SET NULL,
    red_flag_status BOOLEAN NOT NULL DEFAULT FALSE,
    red_flag_message TEXT,
    domain_scores_json JSONB DEFAULT '{}'::jsonb,
    agent_outputs_json JSONB DEFAULT '{}'::jsonb,
    safety_audit_json JSONB DEFAULT '[]'::jsonb,
    final_protocol_json JSONB DEFAULT '{}'::jsonb,
    practitioner_summary TEXT,
    patient_friendly_summary TEXT,
    loops_executed INT NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT_REVIEW' CHECK (status IN ('DRAFT_REVIEW', 'PUBLISHED')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. PROGRESS LOGS (MONITORING & ADAPTATION)
CREATE TABLE IF NOT EXISTS progress_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    pain_score INT NOT NULL,
    sleep_score INT NOT NULL,
    stress_score INT NOT NULL,
    adherence_pct INT NOT NULL DEFAULT 0,
    patient_note TEXT,
    ai_adaptation_alert TEXT,
    alert_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. WA QUEUE (LIFECYCLE MESSAGES)
CREATE TABLE IF NOT EXISTS wa_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('BOOKING', 'H_MINUS_1', 'H_MINUS_2H', 'POST_REVIEW', 'H_PLUS_3')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    message_body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 3),
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. AI USAGE LOGS (GEMINI TOKEN & IDR COST TRACKER)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(100) NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cost_idr NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. REVIEW FEEDBACKS (SMART REVIEW GATE)
CREATE TABLE IF NOT EXISTS review_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    routed_to_gmaps BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_whatsapp ON patients(whatsapp);
CREATE INDEX IF NOT EXISTS idx_patients_magic_token ON patients(magic_token);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_slot_start ON appointments(slot_start);
CREATE INDEX IF NOT EXISTS idx_intakes_patient ON patient_intakes(patient_id);
CREATE INDEX IF NOT EXISTS idx_protocols_patient ON clinical_protocols(patient_id);
CREATE INDEX IF NOT EXISTS idx_progress_patient ON progress_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_wa_queue_status_sched ON wa_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all 9 tables
ALTER TABLE leads_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_feedbacks ENABLE ROW LEVEL SECURITY;

-- 1. Service Role (Full Access to everything for backend operations)
CREATE POLICY "Service Role Full Access: leads_triage" ON leads_triage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: patients" ON patients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: appointments" ON appointments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: patient_intakes" ON patient_intakes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: clinical_protocols" ON clinical_protocols FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: progress_logs" ON progress_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: wa_queue" ON wa_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: ai_usage_logs" ON ai_usage_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access: review_feedbacks" ON review_feedbacks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Authenticated Admin / Staff (Full Access)
CREATE POLICY "Admin Full Access: leads_triage" ON leads_triage FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: patients" ON patients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: appointments" ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: patient_intakes" ON patient_intakes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: clinical_protocols" ON clinical_protocols FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: progress_logs" ON progress_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: wa_queue" ON wa_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: ai_usage_logs" ON ai_usage_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access: review_feedbacks" ON review_feedbacks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Public / Anon Restricted Policies
-- Public can submit lead triage quiz
CREATE POLICY "Public insert leads_triage" ON leads_triage FOR INSERT TO anon WITH CHECK (true);

-- Public can check active appointment slots (read-only for booking availability calculation)
CREATE POLICY "Public read appointments slot info" ON appointments FOR SELECT TO anon USING (true);

-- Public insert review feedbacks via review page
CREATE POLICY "Public insert review_feedbacks" ON review_feedbacks FOR INSERT TO anon WITH CHECK (true);
