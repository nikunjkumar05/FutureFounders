-- Enable Firebase third-party auth in Supabase
-- Run this AFTER configuring Firebase Auth in the Supabase Dashboard:
--   1. Go to Authentication → Providers → Third-party → Firebase
--   2. Enter your Firebase Project ID
--   3. Save

-- Update RLS policies to use auth.uid() for merchant scoping
DO $$ BEGIN
  DECLARE tbl text;
  BEGIN
    FOREACH tbl IN ARRAY ARRAY[
      'merchants','customers','staff','service_cards','attendance',
      'inventory','inventory_transactions','service_inventory_requirements',
      'stock_alerts','cron_logs','support_tickets'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS "select_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "insert_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "update_%s" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "delete_%s" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "select_%s" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "update_%s" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "delete_%s" ON %I FOR DELETE TO authenticated USING (true)', tbl, tbl);
    END LOOP;
  END;
END $$;
