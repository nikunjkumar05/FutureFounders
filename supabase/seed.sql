-- seed.sql
-- Test data to demo the trigger

-- Business
INSERT INTO businesses (id, name, phone, address)
VALUES ('b0000000-0000-0000-0000-000000000001', 'CleanWater Solutions', '+919999999991', 'Mumbai, Maharashtra');

-- Workers
INSERT INTO workers (id, business_id, name, phone)
VALUES
  ('w0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Rajesh Kumar', '+919999999992'),
  ('w0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Amit Singh', '+919999999993');

-- Customers
INSERT INTO customers (id, business_id, name, phone, address, property_type)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Sharma Residence', '+919999999994', 'Andheri West, Mumbai', 'residential'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Green Valley Apartments', '+919999999995', 'Bandra East, Mumbai', 'commercial');

-- Jobs (scheduled, not yet completed)
INSERT INTO jobs (id, business_id, customer_id, worker_id, status, site_lat, site_lng, scheduled_date)
VALUES
  ('j0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'w0000000-0000-0000-0000-000000000001', 'completed', 19.1136, 72.8697, CURRENT_DATE - 1),
  ('j0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'w0000000-0000-0000-0000-000000000002', 'scheduled',  19.0760, 72.8777, CURRENT_DATE);

-- Inventory (chemicals)
INSERT INTO inventory (id, business_id, name, unit, quantity, min_threshold)
VALUES
  ('i0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Chlorine Solution', 'litre', 50, 5),
  ('i0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Anti-Bacterial Gel', 'litre', 30, 3),
  ('i0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Cleaning Scrub', 'piece', 20, 2);

-- Usage for the completed job (trigger will auto-deduct)
INSERT INTO job_inventory_usage (job_id, inventory_id, quantity)
VALUES
  ('j0000000-0000-0000-0000-000000000001', 'i0000000-0000-0000-0000-000000000001', 2.5),
  ('j0000000-0000-0000-0000-000000000001', 'i0000000-0000-0000-0000-000000000002', 1.0);
