-- ==============================================================================
-- RUANG PULIH OS — MIGRATION 004: APPOINTMENT CANCELLATION SUPPORT
-- Mengizinkan status 'CANCELLED' pada tabel appointments agar praktisi dapat membatalkan jadwal
-- dan otomatis melepas slot yang terkunci pada idx_unique_active_slot.
-- ==============================================================================

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check 
  CHECK (status IN ('BOOKED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED'));
