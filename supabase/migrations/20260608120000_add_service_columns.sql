ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers DROP COLUMN IF EXISTS tank_capacity_liters;

ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'standard_cleaning';
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS service_details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS feedback_sent boolean NOT NULL DEFAULT false;
ALTER TABLE service_cards ADD COLUMN IF NOT EXISTS feedback_rating text;
ALTER TABLE service_cards DROP COLUMN IF EXISTS quantity;

CREATE INDEX IF NOT EXISTS idx_service_cards_service_type ON service_cards(service_type);
