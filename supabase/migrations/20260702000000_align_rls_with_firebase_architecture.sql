-- Align RLS with Firebase authentication architecture
--
-- The original disable_rls migration (20260609000000) disabled RLS on all
-- operational tables because Firebase handles authentication and Supabase's
-- anon key is used for all DB queries.
--
-- Three newer tables diverged from this architecture by enabling RLS with
-- authenticated-only policies. Since the frontend never authenticates with
-- Supabase (Firebase handles auth), those policies are never matched and
-- these tables would reject all anon-key requests.
--
-- This migration restores architectural consistency by disabling RLS on
-- the diverged tables, matching the established convention.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'reminder_responses',
    'customer_intelligence',
    'amc_contracts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;
