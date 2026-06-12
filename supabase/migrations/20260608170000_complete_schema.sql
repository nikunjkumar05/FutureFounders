-- ============================================================
-- Operation Overflow App Complete Schema
-- Water tank cleaning operations platform
-- Apply via Bolt Database apply_migration tool
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- 1. merchants
CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz DEFAULT now()
);

-- 2. customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  address text,
  latitude numeric,
  longitude numeric,
  tank_capacity_liters int DEFAULT 1000,
  created_at timestamptz DEFAULT now(),
  UNIQUE (merchant_id, phone)
);

-- 3. staff
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  daily_wage_inr int DEFAULT 500,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Job status type
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. service_cards
CREATE TABLE IF NOT EXISTS service_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  service_details jsonb DEFAULT '{}'::jsonb,
  service_date date DEFAULT CURRENT_DATE,
  next_service_date date,
  job_status job_status DEFAULT 'pending',
  technician_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  notes text,
  feedback_sent boolean DEFAULT false,
  feedback_rating text,
  reminder_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. attendance
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  checkin_time timestamptz,
  checkout_time timestamptz,
  verified_location boolean DEFAULT false,
  date date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 6. inventory
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  unit text DEFAULT 'g',
  current_stock numeric(10,2) DEFAULT 0,
  minimum_threshold numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 7. inventory_transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  quantity_deducted numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 8. service_inventory_requirements
CREATE TABLE IF NOT EXISTS service_inventory_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type varchar NOT NULL,
  item_name varchar NOT NULL,
  quantity_per_1000L numeric NOT NULL
);

-- 9. stock_alerts
CREATE TABLE IF NOT EXISTS stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  alert_type text DEFAULT 'low_stock',
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 10. cron_logs
CREATE TABLE IF NOT EXISTS cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 11. support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  message text NOT NULL,
  ai_response text,
  requires_human_intervention boolean DEFAULT false,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_merchant_id ON customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_staff_merchant_id ON staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_staff_phone ON staff(phone);
CREATE INDEX IF NOT EXISTS idx_service_cards_merchant_id ON service_cards(merchant_id);
CREATE INDEX IF NOT EXISTS idx_service_cards_customer_id ON service_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_cards_job_status ON service_cards(job_status);
CREATE INDEX IF NOT EXISTS idx_attendance_merchant_id ON attendance(merchant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_inventory_merchant_id ON inventory(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_inventory_id ON inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_service_card_id ON inventory_transactions(service_card_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_merchant_id ON stock_alerts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_inventory_id ON stock_alerts(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_resolved ON stock_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_support_tickets_merchant_id ON support_tickets(merchant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_inventory_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Per-verb policies for all tables (demo mode — open to authenticated users)
DO $$ BEGIN
  DECLARE tbl text;
  BEGIN
    FOREACH tbl IN ARRAY ARRAY[
      'merchants','customers','staff','service_cards','attendance',
      'inventory','inventory_transactions','service_inventory_requirements',
      'stock_alerts','cron_logs','support_tickets'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS "select_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "insert_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "update_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "delete_%s" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "select_%s" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "update_%s" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "delete_%s" ON %I FOR DELETE TO authenticated USING (true)', tbl, tbl);
    END LOOP;
  END;
END $$;

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE stock_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE service_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE support_tickets;

-- ============================================================
-- TRIGGER: Auto inventory deduction on job completion
-- ============================================================

CREATE OR REPLACE FUNCTION auto_deduct_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qty integer;
  v_total_capacity integer;
  v_item_name text;
  v_inv_id uuid;
  v_merchant_id uuid;
  v_new_stock numeric;
  v_min_threshold numeric;
  v_deduct_qty numeric;
  v_details jsonb;
  v_sir record;
BEGIN
  IF NEW.job_status = 'completed' AND (OLD.job_status IS NULL OR OLD.job_status != 'completed') THEN
    v_details := COALESCE(NEW.service_details, '{}'::jsonb);

    -- Extract total capacity from service details based on service type
    v_total_capacity := CASE NEW.service_type
      WHEN 'standard_cleaning' THEN COALESCE(NULLIF(v_details->>'totalCapacity', '')::int, 0)
      WHEN 'deep_cleaning' THEN COALESCE(NULLIF(v_details->>'totalCapacity', '')::int, 0)
      WHEN 'sofa_cleaning' THEN COALESCE(NULLIF(v_details->>'sofaCount', '')::int, 1) * 1000
      WHEN 'seats_cleaning' THEN COALESCE(NULLIF(v_details->>'seatCount', '')::int, 1) * 500
      WHEN 'carpet_cleaning' THEN COALESCE(NULLIF(v_details->>'carpetArea', '')::int, 100) * 200
      ELSE 1000
    END;

    IF v_total_capacity IS NULL OR v_total_capacity <= 0 THEN
      v_total_capacity := 1000;
    END IF;

    SELECT c.merchant_id INTO v_merchant_id
      FROM customers c WHERE c.id = NEW.customer_id;

    FOR v_sir IN
      SELECT sir.item_name, sir.quantity_per_1000L
        FROM service_inventory_requirements sir
        WHERE sir.service_type = NEW.service_type
    LOOP
      SELECT i.id, i.current_stock, i.minimum_threshold
        INTO v_inv_id, v_new_stock, v_min_threshold
        FROM inventory i
        WHERE i.item_name = v_sir.item_name AND i.merchant_id = v_merchant_id
        LIMIT 1;

      IF v_inv_id IS NOT NULL THEN
        v_deduct_qty := (v_total_capacity::numeric / 1000.0) * v_sir.quantity_per_1000L;
        v_new_stock := v_new_stock - v_deduct_qty;

        UPDATE inventory
          SET current_stock = GREATEST(v_new_stock, 0)
          WHERE id = v_inv_id;

        INSERT INTO inventory_transactions (inventory_id, service_card_id, quantity_deducted)
          VALUES (v_inv_id, NEW.id, v_deduct_qty);

        IF v_new_stock < v_min_threshold THEN
          INSERT INTO stock_alerts (inventory_id, merchant_id, alert_type)
            VALUES (v_inv_id, v_merchant_id, 'low_stock');
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_deduct_inventory ON service_cards;
CREATE TRIGGER trigger_auto_deduct_inventory
  AFTER UPDATE ON service_cards
  FOR EACH ROW
  EXECUTE FUNCTION auto_deduct_inventory();

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO merchants (id, business_name, owner_name, phone, email)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'AquaClean Services',
  'Sunil Sharma',
  '9876543210',
  'sunil@aquaclean.in'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, merchant_id, name, phone, address, latitude, longitude, tank_capacity_liters)
VALUES
  ('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a31', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Rajesh Kumar', '9123456789', '12 Sector 62, Noida', 28.6139, 77.2090, 1000),
  ('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a32', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Priya Singh', '9234567890', '45 Sector 15, Noida', 28.5800, 77.3200, 2000),
  ('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Amit Verma', '9345678901', '78 Vasundhara, Ghaziabad', 28.6700, 77.4200, 500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff (id, merchant_id, name, phone, daily_wage_inr, is_active)
VALUES
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Ramesh Yadav', '9456789012', 600, true),
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Suresh Kumar', '9567890123', 550, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (id, merchant_id, item_name, unit, current_stock, minimum_threshold)
VALUES
  ('e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a51', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Chlorine', 'g', 500.00, 50.00),
  ('e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a52', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Bleaching Powder', 'g', 300.00, 30.00),
  ('e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a53', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Disinfectant', 'ml', 400.00, 40.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_inventory_requirements (service_type, item_name, quantity_per_1000L)
VALUES
  ('standard_cleaning', 'Chlorine', 50.00),
  ('standard_cleaning', 'Bleaching Powder', 30.00),
  ('deep_cleaning', 'Chlorine', 80.00),
  ('deep_cleaning', 'Bleaching Powder', 50.00),
  ('deep_cleaning', 'Disinfectant', 40.00)
ON CONFLICT DO NOTHING;

INSERT INTO service_cards (id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes)
VALUES
  ('d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a41', 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a31', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'standard_cleaning', '{"tankCount":1,"tankCapacity":1000,"totalCapacity":1000}', CURRENT_DATE - 185, CURRENT_DATE - 5, 'pending', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'Overdue — 5 days past next service'),
  ('d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a42', 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a32', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'deep_cleaning', '{"tankCount":2,"tankCapacity":1000,"totalCapacity":2000}', CURRENT_DATE - 180, CURRENT_DATE + 2, 'pending', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Due this week — deep clean'),
  ('d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a43', 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'standard_cleaning', '{"tankCount":1,"tankCapacity":500,"totalCapacity":500}', CURRENT_DATE, CURRENT_DATE + 90, 'pending', NULL, 'Future appointment')
ON CONFLICT (id) DO NOTHING;
