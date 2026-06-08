-- Add unique constraint on customer phone per merchant
ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_merchant_phone_unique;
ALTER TABLE customers
  ADD CONSTRAINT customers_merchant_phone_unique UNIQUE (merchant_id, phone);
