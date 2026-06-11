-- Create job_services table for multi-service support per job
CREATE TABLE IF NOT EXISTS job_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  service_details jsonb DEFAULT '{}'::jsonb,
  price numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_services_card ON job_services(service_card_id);

-- Add total_charge to service_cards for job-level pricing
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS total_charge numeric(10,2) DEFAULT 0;
