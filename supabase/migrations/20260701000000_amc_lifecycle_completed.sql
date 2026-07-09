-- ============================================================
-- AMC Lifecycle: replace expired with completed
-- ============================================================

-- 1. Migrate existing rows: expired → completed
UPDATE amc_contracts SET status = 'completed' WHERE status = 'expired';

-- 2. Replace CHECK constraint (inline constraints auto-name as <table>_<column>_check)
ALTER TABLE amc_contracts
  DROP CONSTRAINT IF EXISTS amc_contracts_status_check,
  ADD CONSTRAINT amc_contracts_status_check
    CHECK (status IN ('active', 'paused', 'cancelled', 'completed'));

-- 3. Update default to completed instead of expired
ALTER TABLE amc_contracts
  ALTER COLUMN status SET DEFAULT 'active';
