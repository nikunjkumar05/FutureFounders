/*
# Flexible Wage System & Advance Payment Management

## Changes
1. **staff** table: Add `wage_type` (daily/weekly/monthly) and `wage_amount` columns.
2. **advances** table: New table tracking advance payments per staff member.

## Wage Types
- `daily`   → wage_amount is the daily rate (existing daily_wage_inr behavior)
- `weekly`  → wage_amount is the weekly rate
- `monthly` → wage_amount is the monthly salary
*/

-- ============================================================
-- 1. Add wage_type and wage_amount to staff
-- ============================================================
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS wage_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS wage_amount integer NOT NULL DEFAULT 500;

-- Backfill: set existing staff to daily with their current daily_wage_inr
UPDATE staff
  SET wage_type = 'daily', wage_amount = daily_wage_inr
  WHERE wage_type IS NULL OR wage_amount IS NULL;

-- ============================================================
-- 2. Create advances table
-- ============================================================
CREATE TABLE IF NOT EXISTS advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT current_date,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advances_staff_date ON advances(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_advances_merchant ON advances(merchant_id);

-- ============================================================
-- 3. Enable RLS for advances table
-- ============================================================
ALTER TABLE advances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %I', 'advances', 'advances');
  EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I', 'advances', 'advances');
  EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I', 'advances', 'advances');
  EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %I', 'advances', 'advances');
  EXECUTE format('CREATE POLICY "anon_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true)', 'advances', 'advances');
  EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', 'advances', 'advances');
  EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', 'advances', 'advances');
  EXECUTE format('CREATE POLICY "anon_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true)', 'advances', 'advances');
END $$;
