-- 002_inventory_trigger.sql
-- Auto-deduct inventory & schedule 180-day reminder when job completes

-- 1. Function: Deduct inventory from stock
CREATE OR REPLACE FUNCTION deduct_inventory_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when status changes TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Deduct each usage row from inventory
    UPDATE inventory i
    SET quantity = i.quantity - jiu.quantity,
        updated_at = now()
    FROM job_inventory_usage jiu
    WHERE jiu.job_id = NEW.id
      AND jiu.inventory_id = i.id;

    -- Auto-create 180-day service reminder
    INSERT INTO service_reminders (business_id, customer_id, job_id, due_date, status)
    VALUES (
      NEW.business_id,
      NEW.customer_id,
      NEW.id,
      (CURRENT_DATE + INTERVAL '180 days')::DATE,
      'pending'
    );

    -- Set completed_at timestamp
    NEW.completed_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: fires on status update to 'completed'
CREATE TRIGGER trigger_deduct_inventory
  BEFORE UPDATE OF status ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION deduct_inventory_on_complete();


-- 2. Function: Low-stock warning (raises a notice, can be extended to webhook)
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity < NEW.min_threshold THEN
    RAISE NOTICE 'LOW STOCK: % (%) has only % % remaining (threshold: %)',
      NEW.name, NEW.id, NEW.quantity, NEW.unit, NEW.min_threshold;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_low_stock_warning
  AFTER UPDATE OF quantity ON inventory
  FOR EACH ROW
  WHEN (NEW.quantity < NEW.min_threshold)
  EXECUTE FUNCTION check_low_stock();

-- 3. Function: Validate check-in against geofence
CREATE OR REPLACE FUNCTION validate_check_in_geofence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_lat    NUMERIC(10,7);
  job_lng    NUMERIC(10,7);
  radius     INTEGER;
  dist       NUMERIC(10,2);
BEGIN
  -- Get job site coordinates
  SELECT site_lat, site_lng, geofence_radius
  INTO job_lat, job_lng, radius
  FROM jobs
  WHERE id = NEW.job_id;

  -- Only validate if job has coordinates
  IF job_lat IS NOT NULL AND job_lng IS NOT NULL THEN
    -- Haversine distance (simplified for small distances)
    dist := 6371000 * 2 * asin(
      sqrt(
        power(sin(radians(NEW.reported_lat - job_lat) / 2), 2)
        + cos(radians(job_lat)) * cos(radians(NEW.reported_lat))
        * power(sin(radians(NEW.reported_lng - job_lng) / 2), 2)
      )
    );

    NEW.distance_meters := dist;
    NEW.status := CASE
      WHEN dist <= radius THEN 'on_time'
      ELSE 'outside_geofence'
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_geofence_check
  BEFORE INSERT ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION validate_check_in_geofence();
