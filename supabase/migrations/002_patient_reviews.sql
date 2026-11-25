-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 002: PATIENT REVIEWS & SMART REVIEW GATE
-- Lokasi: Jl. Batua Raya 10B No. 9, Makassar (WITA / Asia/Makassar)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS patient_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    routed_to_gmaps BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_patient_reviews_appointment ON patient_reviews(appointment_id);
CREATE INDEX IF NOT EXISTS idx_patient_reviews_patient ON patient_reviews(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reviews_rating ON patient_reviews(rating);

-- Row Level Security (RLS)
ALTER TABLE patient_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access: patient_reviews" ON patient_reviews 
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin Full Access: patient_reviews" ON patient_reviews 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Public insert patient_reviews" ON patient_reviews 
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public read patient_reviews" ON patient_reviews 
    FOR SELECT TO anon USING (true);
