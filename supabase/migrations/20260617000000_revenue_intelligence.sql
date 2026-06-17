-- ============================================================
-- Revenue Intelligence — Customer Reminder Tracking
-- ============================================================

-- 1. reminder_responses: track each reminder and customer reply
CREATE TABLE IF NOT EXISTS reminder_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  response text,
  status text DEFAULT 'sent'
    CHECK (status IN ('sent', 'responded', 'booked', 'ignored')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminder_responses_merchant_id
  ON reminder_responses(merchant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_customer_id
  ON reminder_responses(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_service_card_id
  ON reminder_responses(service_card_id);
CREATE INDEX IF NOT EXISTS idx_reminder_responses_status
  ON reminder_responses(status);

-- 2. customer_intelligence: persistent customer segment / revenue data
CREATE TABLE IF NOT EXISTS customer_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  segment text DEFAULT 'unknown'
    CHECK (segment IN ('ready_to_book', 'follow_up_needed', 'high_churn_risk', 'unknown')),
  estimated_revenue numeric(10,2) DEFAULT 0,
  last_reminder_response text,
  last_contacted_at timestamptz,
  notes text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (merchant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_intelligence_merchant_id
  ON customer_intelligence(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customer_intelligence_segment
  ON customer_intelligence(segment);

ALTER TABLE reminder_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_intelligence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "select_reminder_responses" ON reminder_responses;
  DROP POLICY IF EXISTS "insert_reminder_responses" ON reminder_responses;
  DROP POLICY IF EXISTS "update_reminder_responses" ON reminder_responses;
  DROP POLICY IF EXISTS "delete_reminder_responses" ON reminder_responses;
  CREATE POLICY "select_reminder_responses" ON reminder_responses FOR SELECT TO authenticated USING (true);
  CREATE POLICY "insert_reminder_responses" ON reminder_responses FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "update_reminder_responses" ON reminder_responses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "delete_reminder_responses" ON reminder_responses FOR DELETE TO authenticated USING (true);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "select_customer_intelligence" ON customer_intelligence;
  DROP POLICY IF EXISTS "insert_customer_intelligence" ON customer_intelligence;
  DROP POLICY IF EXISTS "update_customer_intelligence" ON customer_intelligence;
  DROP POLICY IF EXISTS "delete_customer_intelligence" ON customer_intelligence;
  CREATE POLICY "select_customer_intelligence" ON customer_intelligence FOR SELECT TO authenticated USING (true);
  CREATE POLICY "insert_customer_intelligence" ON customer_intelligence FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "update_customer_intelligence" ON customer_intelligence FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "delete_customer_intelligence" ON customer_intelligence FOR DELETE TO authenticated USING (true);
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE reminder_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE customer_intelligence;
