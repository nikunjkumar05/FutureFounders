-- Backfill total_charge on service_cards from existing service_details
UPDATE service_cards
  SET total_charge = (COALESCE(service_details->>'totalCharge', '0')::numeric(10,2))
  WHERE total_charge = 0
    AND service_details IS NOT NULL
    AND service_details ? 'totalCharge';
