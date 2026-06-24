-- Drop ALL remaining unique constraints on customer phone per merchant.
--
-- Two constraints existed because:
-- 1. The initial schema (20260606162111) defined UNIQUE (merchant_id, phone) inline,
--    which PostgreSQL auto-named as customers_merchant_id_phone_key.
-- 2. A later migration (20260608170000_add_unique_phone_customers) attempted to
--    normalize the name by dropping customers_merchant_phone_unique (which didn't
--    exist yet — IF EXISTS made it a no-op) and then ADDing it, creating a second
--    constraint with the explicit name.
--
-- The previous migration (20260624000000) dropped only customers_merchant_phone_unique,
-- leaving the auto-named constraint active. This migration removes all of them.
--
-- Duplicate phone numbers are valid and must be allowed.
-- The application handles duplicate detection as a warning-only workflow.

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    WHERE cls.relname = 'customers'
      AND con.contype = 'u'
      AND con.conkey = (
        SELECT array_agg(attnum ORDER BY attnum)
        FROM pg_attribute
        WHERE attrelid = cls.oid
          AND attname IN ('merchant_id', 'phone')
      )
  LOOP
    EXECUTE format('ALTER TABLE customers DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
