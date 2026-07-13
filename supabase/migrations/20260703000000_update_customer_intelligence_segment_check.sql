-- Update customer_intelligence.segment CHECK constraint to match the
-- CustomerSegment domain type (6 values: scheduled, not_due, ready_to_book,
-- follow_up_needed, high_churn_risk, unknown).
--
-- The original constraint (created in 20260617000000_revenue_intelligence.sql)
-- was written before the lifecycle engine and only allowed the 3 merchant
-- attention categories plus unknown. The lifecycle engine introduced
-- 'scheduled' and 'not_due' as valid lifecycle states that also need to be
-- persisted for accurate transition state tracking.
--
-- This migration synchronises the repository with the schema already applied
-- manually via the Supabase SQL Editor.

ALTER TABLE customer_intelligence
  DROP CONSTRAINT IF EXISTS customer_intelligence_segment_check;

ALTER TABLE customer_intelligence
  ADD CONSTRAINT customer_intelligence_segment_check
  CHECK (segment IN (
    'scheduled',
    'not_due',
    'ready_to_book',
    'follow_up_needed',
    'high_churn_risk',
    'unknown'
  ));
