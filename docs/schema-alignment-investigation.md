# AquaTrak — Schema Alignment & Repository Inspection

**Date:** 2026-07-05
**Status:** Complete (Investigation Only)
**Purpose:** Provide the canonical reference for designing `amc_contracts` and related schema that feels native to AquaTrak.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [service_cards Analysis](#2-service_cards-analysis)
3. [customers Analysis](#3-customers-analysis)
4. [service_details Structure](#4-service_details-structure)
5. [Existing Enum Inventory](#5-existing-enum-inventory)
6. [Naming Convention Summary](#6-naming-convention-summary)
7. [Foreign Key & Constraint Conventions](#7-foreign-key--constraint-conventions)
8. [Indexing Conventions](#8-indexing-conventions)
9. [RLS Strategy](#9-rls-strategy)
10. [Migration Style](#10-migration-style)
11. [Repository Patterns to Reuse](#11-repository-patterns-to-reuse)
12. [Repository Constraints](#12-repository-constraints)
13. [Schema Alignment Recommendations](#13-schema-alignment-recommendations)

---

## 1. Executive Summary

The AquaTrak repository has **13 migration files**, **16 database tables**, **3 CHECK constraints**, **1 PostgreSQL ENUM type**, **~40 indexes**, and **no generated database.types.ts** — all TypeScript types are hand-maintained in `src/lib/types.ts`.

The codebase evolved through three distinct phases:
1. **Initial schema** (Migration 1 + 4) — core business tables with full RLS, trigger, seed data
2. **Feature additions** (Migrations 7-10) — `job_services`, `reminder_responses`, `customer_intelligence`, `advances`
3. **Incremental fixes** (Migrations 11-13) — constraint cleanup, discount column, bot infrastructure

**Key observations for AMC schema alignment:**
- All tables use `uuid` PK with `gen_random_uuid()`, `merchant_id` FK to `merchants(id) ON DELETE CASCADE`, and `created_at timestamptz DEFAULT now()`
- Naming is `snake_case` for columns, `idx_<table>_<column>` for indexes, `{action}_{table}` for RLS policies
- Small enumerations use inline `CHECK` constraints; only `job_status` uses a PostgreSQL `ENUM`
- No soft-delete strategy exists — records are physically deleted
- `service_details` JSONB holds flexible, schema-less service configuration — the canonical extension pattern for AMC

### 1.1 Critical Observations

| Observation | Evidence |
|-------------|----------|
| No generated `database.types.ts` — all types hand-maintained | No file found; `src/lib/types.ts` is the sole type source |
| Two naming conventions for indexes exist | `idx_customers_merchant` (Migration 1) vs `idx_customers_merchant_id` (Migration 4) |
| `SupportTicket` type missing `merchant_id` field | Migration 12 added the column; `types.ts:231-239` lacks it |
| `webhook_idempotency` has no TypeScript interface | Migration 12 created the table; no type in `types.ts` |
| `job_services` and `webhook_idempotency` have no RLS | No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for either |

---

## 2. `service_cards` Analysis

### 2.1 Complete Schema

Defined in `supabase/migrations/20260606162111_aquatrak_schema.sql:84-99`, augmented by migrations 7, 8, 11, 13.

| Column | Type | Constraints | Default | Migration |
|--------|------|-------------|---------|-----------|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | 1 |
| `customer_id` | `uuid` | `NOT NULL`, FK → `customers(id) ON DELETE CASCADE` | — | 1 |
| `merchant_id` | `uuid` | `NOT NULL`, FK → `merchants(id) ON DELETE CASCADE` | — | 1 |
| `service_type` | `text` | `NOT NULL` | `'standard_cleaning'` | 1, 2 |
| `service_details` | `jsonb` | — | `'{}'::jsonb` | 1, 2 |
| `service_date` | `date` | `NOT NULL` | `current_date` | 1 |
| `next_service_date` | `date` | — | — | 1 |
| `job_status` | `job_status` (ENUM) | `NOT NULL` | `'pending'` | 1 |
| `technician_id` | `uuid` | FK → `staff(id)` [no ON DELETE in M1; `ON DELETE SET NULL` in M4] | — | 1 |
| `total_charge` | `numeric(10,2)` | — | `0` | 7 |
| `discount` | `numeric(10,2)` | — | `0` | 13 |
| `notes` | `text` | — | — | 1 |
| `feedback_sent` | `boolean` | `NOT NULL` | `false` | 1, 2 |
| `feedback_rating` | `text` | — | — | 1 |
| `reminder_sent_at` | `timestamptz` | — | — | 1 |
| `created_at` | `timestamptz` | — | `now()` | 1 |

### 2.2 Indexes

| Index Name | Columns | Migration |
|-----------|---------|-----------|
| `idx_service_cards_merchant` / `idx_service_cards_merchant_id` | `merchant_id` | 1, 4 |
| `idx_service_cards_status` / `idx_service_cards_job_status` | `job_status` | 1, 4 |
| `idx_service_cards_next_service` | `next_service_date` | 1 |
| `idx_service_cards_service_type` | `service_type` | 2 |
| `idx_service_cards_customer_id` | `customer_id` | 4 |

### 2.3 What to Reuse for AMC

- **`merchant_id` + `customer_id` pattern**: All AMC tables must follow the same dual-FK ownership pattern
- **`service_details` JSONB**: AMC contract terms (included services, pricing, frequency) should live in a JSONB column following the same pattern
- **`service_type` as `text`**: Not an enum — uses a TypeScript union type for compile-time safety. AMC service types should follow the same pattern
- **`created_at timestamptz DEFAULT now()`**: Universal across all tables
- **`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`**: Universal across all tables
- **No soft-delete**: Physical deletion via `ON DELETE CASCADE` is the convention
- **`numeric(10,2)`**: Standard for all monetary values (`total_charge`, `discount`, `estimated_revenue`, `price`)

### 2.4 What Differs for AMC

- AMC needs `start_date` / `end_date` / `renewal_date` (not just `service_date`/`next_service_date`)
- AMC needs `status` field for contract lifecycle
- AMC needs frequency configuration (not a hardcoded 180-day interval)

---

## 3. `customers` Analysis

### 3.1 Complete Schema

Defined in `supabase/migrations/20260606162111_aquatrak_schema.sql:71-82`, augmented by migration 2.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` |
| `merchant_id` | `uuid` | `NOT NULL`, FK → `merchants(id) ON DELETE CASCADE` | — |
| `name` | `text` | `NOT NULL` | — |
| `phone` | `text` | `NOT NULL` | — |
| `address` | `text` | — | — |
| `notes` | `text` | — | — |
| `latitude` | `numeric(10,7)` | — | — |
| `longitude` | `numeric(10,7)` | — | — |
| `created_at` | `timestamptz` | — | `now()` |

### 3.2 Unique Constraints

The `customers` table had `UNIQUE (merchant_id, phone)` at creation, but **all uniqueness constraints on `(merchant_id, phone)` were dropped** by `20260624100000_drop_all_customers_phone_unique.sql`. The table no longer enforces uniqueness at the database level.

**Evidence:** `supabase/migrations/20260624100000_drop_all_customers_phone_unique.sql:34` — dynamic `pg_constraint` based DROP for all remaining unique constraints on `customers(merchant_id, phone)`.

### 3.3 Merchant Ownership

Every operational entity follows the same ownership pattern: an `merchant_id` column with a FK to `merchants(id) ON DELETE CASCADE`. This pattern is used by:
- `customers`
- `staff`
- `service_cards`
- `attendance`
- `inventory`
- `stock_alerts`
- `reminder_responses`
- `customer_intelligence`
- `advances`
- `support_tickets`

### 3.4 How AMC Should Reference Customers

**`customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE`** — follow the exact FK pattern used by `service_cards`, `reminder_responses`, and `customer_intelligence`. The FK must be `NOT NULL` and use `ON DELETE CASCADE`.

---

## 4. `service_details` Structure

### 4.1 JSON Hierarchy

The `service_details` JSONB column has two formats co-existing:

#### Legacy Format (single service, no nested `services` array)

```json
{
  "tankCount": 1,
  "tankCapacity": 1000,
  "totalCapacity": 1000,
  "serviceType": "standard_cleaning"
}
```

Used in seed data (`migration 1:336-340`) and documented by `TankCleaningDetails`, `DeepCleaningDetails`, `SofaCleaningDetails`, `SeatsCleaningDetails`, `CarpetCleaningDetails`, `CustomServiceDetails` interfaces in `types.ts:24-53`.

#### Canonical Format (multi-service, nested `services` array)

```json
{
  "services": [
    {
      "serviceType": "standard_cleaning",
      "items": [
        {
          "id": "item-auto",
          "quantity": 1,
          "price": 1200,
          "capacity": 1000
        }
      ],
      "totalPrice": 1200
    }
  ],
  "totalCharge": 1200,
  "tankCount": 1,
  "tankCapacity": 1000,
  "totalCapacity": 1000,
  "serviceType": "standard_cleaning"
}
```

Used by webhook auto-booking (`api/webhook/index.ts:191-211`) and produced by `buildServiceDetails()` (`types.ts:449-479`).

### 4.2 Supported Service Types

From `types.ts:3-9`:
```typescript
type ServiceType = 'standard_cleaning' | 'deep_cleaning' | 'sofa_cleaning'
  | 'seats_cleaning' | 'carpet_cleaning' | 'custom_service';
```

### 4.3 Optional Fields in `ServiceItem`

From `types.ts:65-75`:
```typescript
interface ServiceItem {
  id: string;
  quantity: number;
  price: number;
  capacity?: number;
  capacityMode?: 'predefined' | 'custom';
  sofaType?: string;
  carpetArea?: number;
  serviceName?: string;
  notes?: string;
}
```

### 4.4 Canonical Fields Always Present

| Field | Type | Purpose |
|-------|------|---------|
| `services` | `ServiceGroup[]` | Array of service groups (canonical format) |
| `services[].serviceType` | `string` | The service type for this group |
| `services[].items` | `ServiceItem[]` | Service line items |
| `services[].totalPrice` | `number` | Sum of items in this group |
| `totalCharge` | `number` | Grand total for the card |
| `serviceType` | `string` | Primary service type (legacy compatibility) |

### 4.5 Type-Specific Legacy Fields

| Service Type | Fields |
|-------------|--------|
| `standard_cleaning` / `deep_cleaning` | `tankCount`, `tankCapacity`, `totalCapacity` |
| `sofa_cleaning` | `sofaCount`, `sofaType` |
| `seats_cleaning` | `seatCount` |
| `carpet_cleaning` | `carpetArea` |

### 4.6 Determine Whether AMC `service_template` Can Reuse This Structure

**Yes, with extension.** The `services[]` array format is the canonical structure. AMC contract templates should follow the same hierarchy:

```json
{
  "services": [
    {
      "serviceType": "standard_cleaning",
      "items": [{ "quantity": 1, "price": 1200, "capacity": 1000 }],
      "totalPrice": 1200
    }
  ],
  "totalCharge": 1200,
  "frequency": "quarterly",
  "intervalDays": 90
}
```

The `buildServiceDetails` function (`types.ts:449-479`) produces the canonical format and can be reused. AMC-specific fields should be added alongside the existing structure, not by replacing it.

**Recommendation:** AMC contract `service_template` should reuse the same `ServiceGroup[]` / `ServiceItem` hierarchy unchanged. AMC contract metadata (frequency, interval, pricing rules) should live at the same JSONB level as `services`, not nested within it.

---

## 5. Existing Enum Inventory

### 5.1 PostgreSQL ENUM Types

| Enum Name | Values | Defined In | Used By |
|-----------|--------|------------|---------|
| `job_status` | `'pending'`, `'in_progress'`, `'completed'` | Migration 1 (line 42-46) | `service_cards.job_status` |

### 5.2 Inline CHECK Constraints (Acting as Enums)

| Table | Column | CHECK Expression | Migration |
|-------|--------|-----------------|-----------|
| `reminder_responses` | `status` | `IN ('sent', 'responded', 'booked', 'ignored')` | 8 (line 15) |
| `customer_intelligence` | `segment` | `IN ('ready_to_book', 'follow_up_needed', 'high_churn_risk', 'unknown')` | 8 (line 35) |
| `advances` | `amount` | `> 0` | 9 (line 34) |

### 5.3 TypeScript Union Types (Compile-Time Enums)

| Type | Definition | File:Line |
|------|-----------|-----------|
| `JobStatus` | `'pending' \| 'in_progress' \| 'completed'` | `types.ts:1` |
| `ServiceType` | `'standard_cleaning' \| 'deep_cleaning' \| 'sofa_cleaning' \| 'seats_cleaning' \| 'carpet_cleaning' \| 'custom_service'` | `types.ts:3-9` |
| `WageType` | `'daily' \| 'weekly' \| 'monthly'` | `types.ts:145` |
| `ReminderStatus` | `'sent' \| 'responded' \| 'booked' \| 'ignored'` | `types.ts:318` |
| `CustomerSegment` | `'not_due' \| 'ready_to_book' \| 'follow_up_needed' \| 'high_churn_risk' \| 'scheduled' \| 'unknown'` | `types.ts:333` |
| `LifecycleEventType` | `'job_created' \| 'job_completed' \| 'job_deleted' \| 'reminder_sent' \| 'reminder_responded' \| 'reminder_booked' \| 'reminder_ignored' \| 'temporal_evaluation'` | `engine.ts:25-33` |
| `TransitionType` | `'lifecycle_start' \| 'cycle_completion' \| 'cycle_reset' \| 'active_job_override' \| 'active_job_removed' \| 'reminder_transition' \| 'temporal'` | `engine.ts:39-46` |
| `LifecycleState` | `'scheduled' \| 'not_due' \| 'ready_to_book' \| 'follow_up_needed' \| 'high_churn_risk'` | `pipeline.ts:99-104` |
| `ReminderState` | `'not_sent' \| 'awaiting_response' \| 'responded' \| 'booked' \| 'ignored'` | `pipeline.ts:110` |
| `TimePeriod` | `'today' \| 'week' \| 'month' \| 'year' \| 'all'` | `timeUtils.ts:3` |

### 5.4 Which Enums to Reuse

| Enum | Reuse for AMC? | Rationale |
|------|---------------|-----------|
| `job_status` | **Yes** — AMC visit cards use the same status flow | AMC visits are `service_cards`; they move through `pending → in_progress → completed` |
| `ServiceType` | **Yes** — AMC contracts specify which services are included | AMC `service_template` reuses the same type union |
| `ReminderStatus` | **Yes** — AMC visits trigger the same reminder flow | `reminder_responses.status` is unchanged |
| `LifecycleState` | **Extend** — may need `amc_active` or `amc_paused` | New states should be added to the union if AMC affects lifecycle |
| `LifecycleEventType` | **Extend** — may need `amc_visit_completed`, `amc_renewed` | New events should be added to the union |
| `CustomerSegment` | **Extend** — may need AMC-aware segments | New segments like `amc_renewal_due` could be added |

### 5.5 Which New Enums Are Needed

| Concept | Recommendation |
|---------|---------------|
| AMC contract status | `'active' \| 'paused' \| 'cancelled' \| 'expired'` — inline `CHECK` constraint |
| AMC frequency | `'monthly' \| 'quarterly' \| 'biannually' \| 'annually'` — TypeScript union type |
| AMC billing model | `'prepaid' \| 'postpaid'` — TypeScript union type if needed |

**Pattern to follow:** Use inline `CHECK` constraints (like `reminder_responses.status` and `customer_intelligence.segment`) for small, stable enumerations. The only PostgreSQL `ENUM` is `job_status` — and even that could have been an inline CHECK. For AMC, prefer inline CHECK constraints.

---

## 6. Naming Convention Summary

### 6.1 Database Identifiers

| Element | Convention | Example |
|---------|-----------|---------|
| Table names | `snake_case` plural | `service_cards`, `reminder_responses`, `customer_intelligence` |
| Column names | `snake_case` | `merchant_id`, `service_date`, `next_service_date`, `reminder_sent_at` |
| Primary keys | `id` | Always `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Foreign keys | `<referenced_table_singular>_id` | `customer_id`, `merchant_id`, `service_card_id`, `staff_id` |
| Timestamps | `_at` suffix | `created_at`, `updated_at`, `sent_at`, `responded_at`, `checked_in_at`, `reminder_sent_at` |
| Boolean flags | `_sent`, `_paid`, `_active`, `_resolved`, `_flag` suffix | `feedback_sent`, `is_active`, `resolved`, `verified_location`, `requires_human_intervention` |
| Monetary values | `numeric(10,2)` | `total_charge`, `discount`, `estimated_revenue`, `price`, `daily_wage_inr`, `amount` |
| Date fields | `date` type | `service_date`, `next_service_date`, `date` (attendance) |
| JSON fields | `jsonb` | `service_details` |
| Status columns | `text` with `CHECK` or PostgreSQL `ENUM` | `job_status` (ENUM), `status` (CHECK on `reminder_responses`), `segment` (CHECK on `customer_intelligence`) |

### 6.2 Index Naming

Two conventions exist. The later convention (Migration 4+) is recommended:

| Convention | Example | Used In |
|-----------|---------|---------|
| `idx_<table>_<column>` | `idx_customers_merchant`, `idx_service_cards_status` | Migration 1 |
| `idx_<table>_<column_id>` | `idx_customers_merchant_id`, `idx_service_cards_job_status` | Migration 4, 8, 9, 10, 12 |

**Recommendation for AMC:** Use `idx_<table>_<column_id>` (Migration 4+ style) — it is the more recent and more prevalent convention. Example: `idx_amc_contracts_merchant_id`, `idx_amc_contracts_customer_id`.

### 6.3 Constraint Naming

| Constraint Type | Convention | Example |
|----------------|-----------|---------|
| UNIQUE | `{table}_{columns}_unique` (attempted) or auto-named | `customers_merchant_id_phone_key` (auto), `customers_merchant_phone_unique` (explicit attempt in M3) |
| FK | Auto-named by PostgreSQL | `service_cards_customer_id_fkey`, `reminder_responses_service_card_id_fkey` |
| CHECK | Inline, no explicit name | System names like `reminder_responses_status_check` |

**Recommendation for AMC:** Use inline FK definitions (standard practice in all migrations) and inline CHECK constraints. Avoid explicit UNIQUE constraint names — let PostgreSQL auto-name them.

### 6.4 RLS Policy Naming

Three conventions exist. The latest stable convention is:

| Convention | Example | Used In | Roles |
|-----------|---------|---------|-------|
| `anon_{action}_{table}` | `anon_select_merchants` | Migration 1, 9 | `anon, authenticated` |
| `{action}_{table}` | `select_merchants` | Migration 4, 5, 8 | `authenticated` only |

**Recommendation for AMC:** Use `{action}_{table}` (without `anon_` prefix) targeting `TO authenticated` — this is the most recent convention (Migration 8) and matches the current auth setup. Example: `select_amc_contracts`, `insert_amc_contracts`.

### 6.5 TypeScript Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Database model interfaces | `PascalCase` singular matching table name | `ServiceCard`, `ReminderResponse`, `CustomerIntelligence` |
| Extended/joined models | `PascalCase` with `WithDetails` suffix | `ServiceCardWithDetails`, `AttendanceWithStaff` |
| Domain type aliases | `PascalCase` with noun phrase | `JobStatus`, `ServiceType`, `LifecycleState` |
| Pipeline/engine types | `PascalCase` with `Input`, `Result`, `Request`, `Options` | `TransitionInput`, `CustomerAttentionResult`, `TransitionServiceRequest` |
| UI model types | `PascalCase` with domain prefix | `BriefingJob`, `RevenueIntelligence`, `SegmentedCustomer` |
| Constants | `UPPER_SNAKE_CASE` | `SERVICE_TYPE_LABELS`, `MERCHANT_ID`, `TIME_SAVED_WEIGHTS` |
| Functions | `camelCase` | `generateItemId`, `buildServiceDetails`, `estimateServiceValue` |
| Fields | `snake_case` matching DB columns | `service_date`, `next_service_date`, `business_name` |
| Optional fields | `?` suffix | `notes?: string`, `today?: Date` |
| Nullable DB fields | `| null` | `technician_id: string \| null`, `email: string \| null` |

### 6.6 Query Key Naming

| Pattern | Example |
|---------|---------|
| Simple entity | `['customers']`, `['staff']`, `['inventory']` |
| Entity with filter | `['service_cards', status]`, `['attendance', date]` |
| Entity with qualifier | `['stock_alerts', 'resolved']` |
| Entity with params | `['monthly_attendance', staffId, month]` |
| Computed/dashboard | `['dashboard_metrics']`, `['revenue_intelligence']` |

All keys are **lowercase snake_case** strings.

---

## 7. Foreign Key & Constraint Conventions

### 7.1 Foreign Key Pattern

Every operational table follows this exact FK pattern:

```sql
merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
<entity>_id uuid NOT NULL REFERENCES <entities>(id) ON DELETE CASCADE,
```

**All** FK definitions are **inline** within `CREATE TABLE` statements. No explicit FK constraint names are used anywhere — all rely on PostgreSQL auto-naming.

### 7.2 `ON DELETE` Strategy

| ON DELETE | Used For |
|-----------|----------|
| `CASCADE` | All `merchant_id` FKs, all parent-child relationships |
| `SET NULL` | `service_cards.technician_id → staff(id)` (in Migration 4 only) |
| (none — defaults to NO ACTION) | `service_cards.technician_id → staff(id)` (in Migration 1) |

**Recommendation for AMC:** Use `ON DELETE CASCADE` for all FKs. This is the universal pattern. When a merchant is deleted, all their contracts are deleted. When a customer is deleted, all their contracts are deleted.

### 7.3 CHECK Constraints

All CHECK constraints are **inline** within `CREATE TABLE` statements:

```sql
status text NOT NULL DEFAULT 'sent'
  CHECK (status IN ('sent', 'responded', 'booked', 'ignored')),
amount integer NOT NULL
  CHECK (amount > 0),
```

**Recommendation for AMC:** All AMC status, frequency, and validation constraints should be inline CHECK constraints.

### 7.4 UNIQUE Constraints

Only two multi-column UNIQUE constraints exist:
- `customers(merchant_id, phone)` — **was** present, now **dropped** (Migration 11)
- `customer_intelligence(merchant_id, customer_id)` — **present**

**Recommendation for AMC:** Use `UNIQUE (merchant_id, customer_id, contract_type)` if one customer can have one active contract of each type. Or use `UNIQUE (merchant_id, customer_id)` if one customer can have exactly one contract.

---

## 8. Indexing Conventions

### 8.1 Index Strategy

| Index Purpose | Convention | Example |
|--------------|-----------|---------|
| Merchant lookup | `idx_<table>_merchant_id` | `idx_customer_intelligence_merchant_id` |
| Entity lookup | `idx_<table>_<entity>_id` | `idx_reminder_responses_customer_id` |
| Status filter | `idx_<table>_<status_column>` | `idx_reminder_responses_status`, `idx_service_cards_job_status` |
| Compound lookup | `idx_<table>_<col1>_<col2>` | `idx_attendance_staff_date`, `idx_advances_staff_date` |

### 8.2 Indexes Always Created for New Tables

| Index | Rationale |
|-------|-----------|
| `idx_<table>_merchant_id` | All queries filter by `merchant_id` |
| `idx_<table>_customer_id` (if applicable) | Customer-scoped queries (reminders, CI, etc.) |
| `idx_<table>_status` (if applicable) | Status-filtered queries |

### 8.3 Recommended Indexes for AMC

```sql
CREATE INDEX IF NOT EXISTS idx_amc_contracts_merchant_id ON amc_contracts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_id ON amc_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status ON amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_next_visit ON amc_contracts(next_visit_date);
```

---

## 9. RLS Strategy

### 9.1 Current State

RLS has been **disabled** on all tables (Migration 6: `20260609000000_disable_rls.sql`). The policies defined in Migration 4 and 5 (`{action}_{table}` targeting `TO authenticated`) are the most recent active definitions.

### 9.2 RLS Policy Pattern

All policies use:
```sql
CREATE POLICY "select_<table>" ON <table> FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_<table>" ON <table> FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_<table>" ON <table> FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_<table>" ON <table> FOR DELETE TO authenticated USING (true);
```

Generated via DO block:
```sql
DO $$ BEGIN
  DROP POLICY IF EXISTS 'select_<table>' ON <table>;
  CREATE POLICY 'select_<table>' ON <table> FOR SELECT TO authenticated USING (true);
  -- ... same for insert, update, delete
END $$;
```

### 9.3 Recommended AMC RLS

Follow Migration 8 style (most recent convention for new tables):

```sql
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS 'select_amc_contracts' ON amc_contracts;
  CREATE POLICY 'select_amc_contracts' ON amc_contracts FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS 'insert_amc_contracts' ON amc_contracts;
  CREATE POLICY 'insert_amc_contracts' ON amc_contracts FOR INSERT TO authenticated WITH CHECK (true);
  DROP POLICY IF EXISTS 'update_amc_contracts' ON amc_contracts;
  CREATE POLICY 'update_amc_contracts' ON amc_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS 'delete_amc_contracts' ON amc_contracts;
  CREATE POLICY 'delete_amc_contracts' ON amc_contracts FOR DELETE TO authenticated USING (true);
END $$;
```

---

## 10. Migration Style

### 10.1 File Naming

```
YYYYMMDDHHMMSS_descriptive_name.sql
```

Examples:
- `20260606162111_aquatrak_schema.sql` — initial schema
- `20260617000000_revenue_intelligence.sql` — feature addition
- `20260619000000_flexible_wage_advances.sql` — feature addition
- `20260628000000_add_job_discount.sql` — single column addition

Timestamp is `YYYYMMDDHHMMSS` (14 digits). Name is `snake_case` descriptive.

### 10.2 Migration Organization

Every migration follows this order (when applicable):

1. **CREATE TYPE** (guarded, if needed)
2. **CREATE TABLE** statements
3. **ALTER TABLE** statements (ADD/DROP columns)
4. **CREATE INDEX** statements (at the end, not interleaved)
5. **ALTER TABLE ... ENABLE ROW LEVEL SECURITY**
6. **CREATE POLICY** via DO block
7. **ALTER PUBLICATION supabase_realtime ADD TABLE** (if realtime needed)
8. **CREATE OR REPLACE FUNCTION** (if needed)
9. **CREATE TRIGGER** (if needed)
10. **Seed data** (INSERT with ON CONFLICT DO NOTHING)

### 10.3 Guarded CREATE TYPE Pattern

Two patterns exist. Pattern A (Migration 1) is recommended:

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM ('pending', 'in_progress', 'completed');
  END IF;
END $$;
```

### 10.4 Idempotent Column Additions

All ALTER TABLE statements use:
```sql
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> <type> <default>;
ALTER TABLE <table> DROP COLUMN IF EXISTS <column>;
```

### 10.5 Guarded Index Creation

All CREATE INDEX statements use `IF NOT EXISTS`:
```sql
CREATE INDEX IF NOT EXISTS idx_<table>_<column> ON <table>(<column>);
```

### 10.6 Realtime Publication

When a table needs realtime:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE <table>;
```

### 10.7 Recommended AMC Migration Structure

```sql
-- 1. CREATE amc_contracts table
CREATE TABLE IF NOT EXISTS amc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- ... AMC-specific fields
  created_at timestamptz DEFAULT now()
);

-- 2. CREATE INDEX
CREATE INDEX IF NOT EXISTS idx_amc_contracts_merchant_id ON amc_contracts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_id ON amc_contracts(customer_id);
-- ... additional indexes

-- 3. ENABLE RLS
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;

-- 4. CREATE POLICIES
DO $$ BEGIN
  DROP POLICY IF EXISTS 'select_amc_contracts' ON amc_contracts;
  CREATE POLICY 'select_amc_contracts' ON amc_contracts FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS 'insert_amc_contracts' ON amc_contracts;
  CREATE POLICY 'insert_amc_contracts' ON amc_contracts FOR INSERT TO authenticated WITH CHECK (true);
  DROP POLICY IF EXISTS 'update_amc_contracts' ON amc_contracts;
  CREATE POLICY 'update_amc_contracts' ON amc_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS 'delete_amc_contracts' ON amc_contracts;
  FOR DELETE TO authenticated USING (true);
END $$;

-- 5. ALTER PUBLICATION (if realtime needed)
ALTER PUBLICATION supabase_realtime ADD TABLE amc_contracts;
```

---

## 11. Repository Patterns to Reuse

### 11.1 TypeScript Interface Pattern

Every database table maps to an interface in `types.ts`:

```typescript
export interface AmcContract {
  id: string;
  merchant_id: string;
  customer_id: string;
  // ... snake_case fields matching DB columns
  created_at: string;
}

// Extended type for joined queries
export interface AmcContractWithDetails extends AmcContract {
  customers: Customer;
}
```

### 11.2 Query Hook Pattern

```typescript
export function useAmcContracts() {
  return useQuery({
    queryKey: ['amc_contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('*, customers(name, phone)')
        .eq('merchant_id', MERCHANT_ID)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AmcContractWithDetails[];
    },
  });
}
```

### 11.3 Mutation Hook Pattern

```typescript
export function useCreateAmcContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contract: { customerId: string; /* fields */ }) => {
      const { data, error } = await supabase
        .from('amc_contracts')
        .insert({
          merchant_id: MERCHANT_ID,
          customer_id: contract.customerId,
          // ... fields with ?? null for optionals
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['amc_contracts'] });
      trackEvent('amc_created', {
        amc_id: (data as Record<string, unknown>).id as string,
        customer_id: variables.customerId,
      });
    },
  });
}
```

### 11.4 Select Field List Pattern

For critical queries (like `service_cards`), explicit field lists are used instead of `'*'`. Consider an explicit field list for AMC contracts if the row becomes wide.

### 11.5 Analytics Event Pattern

Add new event names to the `AnalyticsEvent` union type in `analytics.ts:24-47`:

```typescript
| 'amc_created'
| 'amc_updated'
| 'amc_cancelled'
| 'amc_visit_generated'
```

### 11.6 Constants Pattern

API endpoints, seeds, etc. use a hardcoded `MERCHANT_ID` constant (`queries.ts:40`). Beyond that, there is no constants file — labels are defined alongside their types (`SERVICE_TYPE_LABELS` in `types.ts`, `TIME_SAVED_WEIGHTS` in `timeSaved.ts`).

### 11.7 The `?? null` Pattern for Optional Fields

All mutation inserts use `?? null` for optional fields:
```typescript
field: optionalValue ?? null,
```

This ensures optional fields are explicitly `null` in the database when not provided.

---

## 12. Repository Constraints

### 12.1 Merchant Isolation

Every operational entity is scoped to a merchant via `merchant_id`. All queries filter by `.eq('merchant_id', MERCHANT_ID)`. The AMC schema **must** include `merchant_id` as a `NOT NULL` FK.

### 12.2 Canonical Ownership Boundaries

| Domain | Canonical Owner | AMC Must Respect |
|--------|----------------|------------------|
| Service cards | `Jobs.tsx` + `queries.ts` mutations | AMC visits are `service_cards` — written by visit generator cron |
| Customer lifecycle | `customer-intelligence.ts` + `pipeline.ts` + `engine.ts` | AMC adds wrappers, does not modify these |
| Reminders | `send-reminders.ts` cron + pipeline | AMC visits trigger reminders via existing mechanism |
| Revenue | `monthly-revenue.ts` + `RevenueIntelligence.tsx` | AMC visit revenue included naturally |
| Staff | `queries.ts` staff hooks | AMC visits assign technicians via existing `technician_id` |

### 12.3 Customer References

AMC contracts must reference customers via `customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE` — the exact FK pattern used by `service_cards`, `reminder_responses`, and `customer_intelligence`.

### 12.4 No Soft-Delete

There is no `deleted_at`, `is_deleted`, or `archived` column anywhere in the schema. Records are physically deleted via `DELETE FROM` queries. AMC contracts that need "cancellation" should use a `status` field (`'active' | 'paused' | 'cancelled' | 'expired'`) rather than a soft-delete mechanism.

### 12.5 Merchant Isolation at the Application Level

All queries filter by merchant_id. There is no row-level security enabled. The application enforces merchant isolation through the `MERCHANT_ID` constant and query filters, NOT through database RLS.

### 12.6 UUID Strategy

Every table uses `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. No auto-increment integers are used anywhere.

### 12.7 Timestamp Strategy

- `created_at timestamptz DEFAULT now()` — present on every table
- `updated_at timestamptz DEFAULT now()` — present on `customer_intelligence` only (no trigger-based auto-update)
- No `ON UPDATE` triggers exist

### 12.8 No Database-Generated Types

There is no `supabase gen types` pipeline. All TypeScript types are hand-maintained. Any `database.types.ts` would need to be created and regenerated after schema changes.

---

## 13. Schema Alignment Recommendations

### 13.1 Table Design Rules

| Rule | AMC Must Follow |
|------|----------------|
| PK: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Yes |
| Merchant FK: `merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE` | Yes |
| Customer FK: `customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE` | Yes |
| Timestamp: `created_at timestamptz DEFAULT now()` | Yes |
| Status constraints: inline `CHECK` | Yes |
| Index naming: `idx_<table>_<column_id>` | Yes |
| Time fields: `date` for dates, `timestamptz` for timestamps | Yes |
| Monetary fields: `numeric(10,2)` | Yes |
| JSON fields: `jsonb` with `DEFAULT '{}'::jsonb` | Yes |

### 13.2 Naming Conventions to Follow

| Element | Convention |
|---------|-----------|
| Table name | `amc_contracts` (snake_case, plural) |
| Columns | `start_date`, `end_date`, `next_visit_date`, `status`, `frequency` |
| Indexes | `idx_amc_contracts_merchant_id`, `idx_amc_contracts_customer_id` |
| RLS policies | `select_amc_contracts`, `insert_amc_contracts` |
| TypeScript interface | `AmcContract` |
| TypeScript extended type | `AmcContractWithDetails` |
| Query key | `['amc_contracts']` |
| Analytics event | `amc_created`, `amc_updated`, `amc_cancelled` |

### 13.3 Patterns to Reuse

| Pattern | Reference |
|---------|-----------|
| `CREATE TABLE IF NOT EXISTS` + inline FK + inline CHECK | Migration 8 (`reminder_responses`) |
| Guarded `CREATE INDEX IF NOT EXISTS idx_...` | All migrations |
| RLS via DO block with DROP/CREATE | Migration 8 (latest convention) |
| `useQuery` hook with `queryKey: ['entity_name']` | `queries.ts` (all query hooks) |
| `useMutation` hook with `onSuccess: invalidate + trackEvent` | `queries.ts` (all mutation hooks) |
| TypeScript interface with snake_case DB fields | `types.ts` (all DB model interfaces) |
| TypeScript union type for constrained values | `types.ts` (`JobStatus`, `ServiceType`, etc.) |
| Optional fields as `?? null` in mutation payloads | `queries.ts` (all mutations) |

### 13.4 Patterns to Avoid

| Anti-Pattern | Avoid Because |
|-------------|---------------|
| `CREATE TYPE ... AS ENUM` for small enumerations | Inline CHECK is the more recent and simpler convention |
| `idx_<table>_<column>` without `_id` suffix | Use `idx_<table>_<column_id>` when column ends in `_id` |
| `WITH CHECK (true)` for status transitions | All existing policies are fully open — follow this unless there's a specific business rule |
| Non-idempotent statements | Always use `IF NOT EXISTS`, `DROP ... IF EXISTS`, `ADD COLUMN IF NOT EXISTS` |

### 13.5 Unknowns That Require Design Decisions (Not Investigation)

The following are outside scope of this investigation but needed before schema design:

1. **Should AMC contracts have `UNIQUE (merchant_id, customer_id)`?** The `customer_intelligence` table does; no other table does. This depends on whether a customer can have multiple AMC contracts.

2. **Should AMC contracts reside in the `supabase_realtime` publication?** Depends on whether the UI needs realtime contract status updates.

3. **Should `updated_at` be auto-updated via trigger?** Currently only `customer_intelligence` has `updated_at` and it is set manually via code. No trigger-based auto-update exists anywhere.

4. **What is the AMC visit generation strategy?** The schema does not define how visits are created from contracts — this is an implementation concern beyond schema alignment.
