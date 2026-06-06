-- seed.sql

-- Profiles (links auth.users to app data)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'provider')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Business
INSERT INTO businesses (id, name, phone, address)
VALUES ('b0000000-0000-0000-0000-000000000001', 'CleanWater Solutions', '+919999999991', 'Mumbai, Maharashtra');

-- Workers
INSERT INTO workers (id, business_id, name, phone)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Rajesh Kumar', '+919999999992'),
  ('00000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Amit Singh', '+919999999993');

-- Customers
INSERT INTO customers (id, business_id, name, phone, address, property_type)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Sharma Residence', '+919999999994', 'Andheri West, Mumbai', 'residential'),
  ('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Green Valley Apartments', '+919999999995', 'Bandra East, Mumbai', 'commercial');

-- Jobs (all start as 'scheduled' so the UPDATE trigger fires)
INSERT INTO jobs (id, business_id, customer_id, worker_id, status, site_lat, site_lng, scheduled_date)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'scheduled', 19.1136, 72.8697, CURRENT_DATE - 1),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'scheduled', 19.0760, 72.8777, CURRENT_DATE);

-- Inventory (chemicals)
INSERT INTO inventory (id, business_id, name, unit, quantity, min_threshold)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Chlorine Solution', 'litre', 50, 5),
  ('30000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Anti-Bacterial Gel', 'litre', 30, 3),
  ('30000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Cleaning Scrub', 'piece', 20, 2);

-- Usage rows for job #1 (created before marking it complete)
INSERT INTO job_inventory_usage (job_id, inventory_id, quantity)
VALUES
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 2.5),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1.0);

-- Tanks (example data): record individual tanks per customer
-- Sharma Residence: 3 tanks of 1000L
INSERT INTO tanks (business_id, customer_id, capacity_liters) VALUES
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1000),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1000),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1000);

-- Green Valley Apartments: 2 tanks of 10000L
INSERT INTO tanks (business_id, customer_id, capacity_liters) VALUES
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 10000),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 10000);

-- Mark job #1 as complete → trigger fires: deducts inventory + creates 180-day reminder
UPDATE jobs SET status = 'completed' WHERE id = '20000000-0000-0000-0000-000000000001';
