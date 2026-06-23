-- Disable RLS on tables created after 20260609000000_disable_rls.sql
-- These were missed because they were created in a later migration.
-- Consistent with the rest of the project: Firebase handles auth,
-- Supabase anon key is used for all DB queries.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'reminder_responses',
    'customer_intelligence'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;
