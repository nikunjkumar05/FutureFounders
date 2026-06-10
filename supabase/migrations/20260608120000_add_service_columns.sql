-- ============================================================
-- Migration: Add multi-service and multi-worker support
-- ============================================================

-- Add service columns to service_cards
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'standard_cleaning';
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS service_details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS feedback_sent boolean NOT NULL DEFAULT false;
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS feedback_rating text;
ALTER TABLE service_cards DROP COLUMN IF EXISTS quantity;

-- Customers: remove tank_capacity_liters, add notes
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers DROP COLUMN IF EXISTS tank_capacity_liters;

-- ============================================================
-- NEW TABLE: job_services (multiple services per job)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  service_details jsonb DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_services_card ON job_services(service_card_id);

-- ============================================================
-- NEW TABLE: job_workers (multiple workers per job)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_card_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_job_workers_card ON job_workers(service_card_id);
CREATE INDEX IF NOT EXISTS idx_job_workers_staff ON job_workers(staff_id);

-- RLS
ALTER TABLE job_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_workers ENABLE ROW LEVEL SECURITY;

-- Seed data: migrate existing service cards to job_services
INSERT INTO job_services (service_card_id, service_type, service_details, notes)
SELECT id, service_type, service_details, notes FROM service_cards
WHERE service_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing technician to job_workers
INSERT INTO job_workers (service_card_id, staff_id)
SELECT id, technician_id FROM service_cards
WHERE technician_id IS NOT NULL
ON CONFLICT DO NOTHING;
