-- Disable RLS on all tables since Firebase handles authentication
-- Supabase's anon key is used for all DB queries
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'merchants','customers','staff','service_cards','attendance',
    'inventory','inventory_transactions','service_inventory_requirements',
    'stock_alerts','cron_logs','support_tickets'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;
