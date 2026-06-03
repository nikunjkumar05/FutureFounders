-- 001_schema.sql
-- Core tables for the SMB operations engine

-- 1. Businesses (tenants)
CREATE TABLE businesses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Workers (field technicians)
CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Customers
CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT,
  property_type TEXT, -- e.g. 'residential', 'commercial'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Jobs
CREATE TYPE job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  worker_id       UUID REFERENCES workers(id),
  status          job_status NOT NULL DEFAULT 'scheduled',
  site_lat        NUMERIC(10,7),
  site_lng        NUMERIC(10,7),
  geofence_radius INTEGER NOT NULL DEFAULT 100, -- meters
  scheduled_date  DATE,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Inventory (chemical stock)
CREATE TABLE inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL, -- e.g. 'litre', 'kg', 'piece'
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_threshold NUMERIC(10,2) NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Job Inventory Usage (link table)
CREATE TABLE job_inventory_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  inventory_id  UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  quantity      NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Check-Ins (attendance via WhatsApp geolocation)
CREATE TYPE check_in_status AS ENUM ('on_time', 'late', 'outside_geofence');

CREATE TABLE check_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id       UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  status          check_in_status NOT NULL,
  reported_lat    NUMERIC(10,7),
  reported_lng    NUMERIC(10,7),
  distance_meters NUMERIC(10,2),
  webhook_ts      TIMESTAMPTZ, -- timestamp from WhatsApp
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Service Reminders (180-day)
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'converted', 'failed');

CREATE TABLE service_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id),
  due_date        DATE NOT NULL,
  status          reminder_status NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  whatsapp_msg_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Conversations (LLM auto-responder log)
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_phone  TEXT NOT NULL,
  message_in      TEXT NOT NULL,
  message_out     TEXT,
  category        TEXT, -- classified category
  handled_by      TEXT NOT NULL DEFAULT 'llm', -- 'llm' or 'human'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_jobs_business_status ON jobs(business_id, status);
CREATE INDEX idx_jobs_worker ON jobs(worker_id);
CREATE INDEX idx_check_ins_job ON check_ins(job_id);
CREATE INDEX idx_reminders_due ON service_reminders(due_date, status);
CREATE INDEX idx_inventory_business ON inventory(business_id);
CREATE INDEX idx_conversations_business ON conversations(business_id);
