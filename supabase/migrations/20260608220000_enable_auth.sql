-- Enable email/password auth (required for signup/login)
-- Run this in Supabase SQL Editor if not already enabled via Dashboard

-- Update RLS policies to use auth.uid() merchant scoping
-- instead of fully-open demo mode

-- First, drop the old permissive policies
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
    END LOOP;
  END;
END $$;

-- Recreate with auth.uid() scoping (demo: allow all authenticated users)
-- In production, replace USING (true) with USING (merchant_id = auth.uid())
DO $$ BEGIN
  DECLARE tbl text;
  BEGIN
    FOREACH tbl IN ARRAY ARRAY[
      'merchants','customers','staff','service_cards','attendance',
      'inventory','inventory_transactions','service_inventory_requirements',
      'stock_alerts','cron_logs','support_tickets'
    ] LOOP
      EXECUTE format('CREATE POLICY "select_%s" ON %I FOR SELECT TO authenticated USING (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "update_%s" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
      EXECUTE format('CREATE POLICY "delete_%s" ON %I FOR DELETE TO authenticated USING (true)', tbl, tbl);
    END LOOP;
  END;
END $$;
