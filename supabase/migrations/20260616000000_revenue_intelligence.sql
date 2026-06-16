-- ============================================================
-- Revenue Intelligence — WhatsApp-Native Revenue Dashboard
-- Adds: reminder response tracking, reminder logs,
--       revenue estimation columns
-- ============================================================

-- ─── Columns on service_cards ──────────────────────────────────

ALTER TABLE service_cards
  ADD COLUMN IF NOT EXISTS reminder_response text
    CHECK (reminder_response IN ('interested', 'not_interested')),
  ADD COLUMN IF NOT EXISTS reminder_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0;

-- ─── Reminder logs table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id uuid NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  response text CHECK (response IN ('interested', 'not_interested', 'no_response')),
  responded_at timestamptz,
  channel text DEFAULT 'whatsapp',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_merchant ON reminder_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_customer ON reminder_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_service_card ON reminder_logs(service_card_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at ON reminder_logs(sent_at);

-- ─── RLS for reminder_logs ────────────────────────────────────

ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "select_reminder_logs" ON reminder_logs');
  EXECUTE format('DROP POLICY IF EXISTS "insert_reminder_logs" ON reminder_logs');
  EXECUTE format('DROP POLICY IF EXISTS "update_reminder_logs" ON reminder_logs');
  EXECUTE format('CREATE POLICY "select_reminder_logs" ON reminder_logs FOR SELECT TO authenticated USING (true)');
  EXECUTE format('CREATE POLICY "insert_reminder_logs" ON reminder_logs FOR INSERT TO authenticated WITH CHECK (true)');
  EXECUTE format('CREATE POLICY "update_reminder_logs" ON reminder_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true)');
END $$;

-- ─── Realtime ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE reminder_logs;

-- ─── Seed: Add reminder tracking to existing service cards ────

UPDATE service_cards
SET reminder_count = CASE WHEN reminder_sent_at IS NOT NULL THEN 1 ELSE 0 END
WHERE reminder_count IS NULL OR reminder_count = 0;
