-- Enhance job_services table with proper columns for multi-service support
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS capacity_or_variant text;
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS notes text;

-- Add index for faster lookups by service_card_id
CREATE INDEX IF NOT EXISTS idx_job_services_card_id ON job_services(service_card_id);
