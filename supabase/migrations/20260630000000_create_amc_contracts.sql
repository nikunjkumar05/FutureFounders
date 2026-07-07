-- ============================================================
-- AMC Contracts — Annual Maintenance Contract Foundation
-- ============================================================

-- 1. amc_contracts: define recurring service agreements
CREATE TABLE IF NOT EXISTS amc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  frequency text NOT NULL
    CHECK (frequency IN ('monthly', 'quarterly', 'biannual', 'annual')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  service_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_contracts_merchant_id
  ON amc_contracts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_id
  ON amc_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status
  ON amc_contracts(status);

-- 2. link service_cards to AMC contracts
ALTER TABLE service_cards
  ADD COLUMN IF NOT EXISTS amc_contract_id uuid
    REFERENCES amc_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_cards_amc_contract_id
  ON service_cards(amc_contract_id);

-- 3. RLS
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "select_amc_contracts" ON amc_contracts;
  DROP POLICY IF EXISTS "insert_amc_contracts" ON amc_contracts;
  DROP POLICY IF EXISTS "update_amc_contracts" ON amc_contracts;
  DROP POLICY IF EXISTS "delete_amc_contracts" ON amc_contracts;
  CREATE POLICY "select_amc_contracts" ON amc_contracts FOR SELECT TO authenticated USING (true);
  CREATE POLICY "insert_amc_contracts" ON amc_contracts FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "update_amc_contracts" ON amc_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "delete_amc_contracts" ON amc_contracts FOR DELETE TO authenticated USING (true);
END $$;
