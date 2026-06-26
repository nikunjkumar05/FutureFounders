-- Webhook idempotency table
CREATE TABLE IF NOT EXISTS webhook_idempotency (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-cleanup old idempotency keys (7 days)
CREATE OR REPLACE FUNCTION cleanup_idempotency_keys()
RETURNS void AS $$
  DELETE FROM webhook_idempotency WHERE created_at < now() - interval '7 days';
$$ LANGUAGE sql;

-- Add merchant_id to support_tickets if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'merchant_id'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN merchant_id UUID;
  END IF;
END $$;

-- Index for webhook_idempotency cleanup
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_created
  ON webhook_idempotency (created_at);
