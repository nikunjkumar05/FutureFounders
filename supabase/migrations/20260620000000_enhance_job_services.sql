-- Enhance job_services table with explicit columns for multi-service support
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS capacity_or_variant text;
ALTER TABLE job_services ADD COLUMN IF NOT EXISTS notes text;

-- Add price precision default
ALTER TABLE job_services ALTER COLUMN price SET DEFAULT 0;
