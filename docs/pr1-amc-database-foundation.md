# PR 1: AMC Database Foundation — Engineering Summary

## Branch
`feat/amc-database-foundation`

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260630000000_create_amc_contracts.sql` | **Added** — new migration |
| `src/lib/types.ts` | **Modified** — added `AmcContract`, `AmcContractWithDetails`, `AmcContractStatus`, `AmcFrequency`; added `amc_contract_id` to `ServiceCard` |
| `src/lib/customer-attention-pipeline.validation.ts` | **Modified** — added `amc_contract_id: null` to mock card factory |
| `src/lib/lifecycle-transition-engine.validation.ts` | **Modified** — same |
| `src/lib/transition-service.validation.ts` | **Modified** — same |

No UI, no business logic, no queries, no mutations, no React components.

---

## Database Objects Added

### New Table: `amc_contracts`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `merchant_id` | `uuid` | `NOT NULL`, FK → `merchants(id) ON DELETE CASCADE` |
| `customer_id` | `uuid` | `NOT NULL`, FK → `customers(id) ON DELETE CASCADE` |
| `start_date` | `date` | `NOT NULL` |
| `end_date` | `date` | `NOT NULL` |
| `frequency` | `text` | `NOT NULL`, `CHECK (frequency IN ('monthly','quarterly','biannual','annual'))` |
| `status` | `text` | `NOT NULL DEFAULT 'active'`, `CHECK (status IN ('active','paused','cancelled','expired'))` |
| `service_template` | `jsonb` | `NOT NULL DEFAULT '{}'::jsonb` |
| `notes` | `text` | nullable |
| `created_at` | `timestamptz` | `DEFAULT now()` |

### Indexes

| Index Name | Table | Column(s) |
|-----------|-------|-----------|
| `idx_amc_contracts_merchant_id` | `amc_contracts` | `merchant_id` |
| `idx_amc_contracts_customer_id` | `amc_contracts` | `customer_id` |
| `idx_amc_contracts_status` | `amc_contracts` | `status` |
| `idx_service_cards_amc_contract_id` | `service_cards` | `amc_contract_id` |

### RLS Policies

4 policies on `amc_contracts`: `select_amc_contracts`, `insert_amc_contracts`, `update_amc_contracts`, `delete_amc_contracts` — all targeting `TO authenticated` with `USING (true)` / `WITH CHECK (true)`.

---

## Existing Database Objects Modified

### `service_cards` — Added Column

| Column | Type | Constraints |
|--------|------|-------------|
| `amc_contract_id` | `uuid` | nullable, FK → `amc_contracts(id) ON DELETE SET NULL` |

`ON DELETE SET NULL` ensures that deleting an AMC contract does not cascade-delete its service history. Historical service cards remain intact with `amc_contract_id = NULL`.

---

## Architectural Decisions Preserved

| Decision | How It Was Preserved |
|----------|---------------------|
| **No visit duplication** | No `amc_visits` table. Completed visits remain `service_cards` — the single canonical visit representation |
| **No derived state stored** | No `completed_visits`, `remaining_visits`, `next_visit_date`, `renewal_due`, `visit_number`, or any computed field |
| **Service template reuses canonical structure** | `service_template` is `jsonb` reusing the same `ServiceGroup[]` / `ServiceItem` hierarchy as `service_cards.service_details` |
| **Historical preservation** | No `UNIQUE (merchant_id, customer_id)` constraint. Multiple contracts per customer are naturally supported. The `status` field (`active` / `paused` / `cancelled` / `expired`) distinguishes active from historical |
| **Historical immutability** | Once a contract's status is `cancelled` or `expired`, no foreign constraint or cascade rule mutates it. History is preserved by design |
| **Normal jobs unaffected** | `service_cards.amc_contract_id` is nullable. Normal jobs leave it `NULL` and work exactly as before |
| **Merchant ownership** | `merchant_id` FK with `ON DELETE CASCADE` — standard for all operational tables |
| **FK strategy** | Inline FK definitions, `ON DELETE CASCADE` for ownership, `ON DELETE SET NULL` for optional relationship — matching the `technician_id` pattern on `service_cards` |

---

## Repository Conventions Followed

| Convention | Application |
|-----------|-------------|
| UUID PK | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Timestamps | `created_at timestamptz DEFAULT now()` |
| Monetary/json types | `jsonb` for `service_template`, `numeric` not applicable here |
| Inline CHECK constraints | `frequency` and `status` use `CHECK (... IN (...))` — matching `reminder_responses.status` and `customer_intelligence.segment` |
| Index naming | `idx_<table>_<column_id>` — matching Migration 4+/8 style |
| Migration organization | CREATE TABLE → CREATE INDEX → ALTER TABLE → CREATE INDEX → ENABLE RLS → CREATE POLICY — matching Migration 8 style |
| RLS naming | `{action}_{table}` (no `anon_` prefix) — matching Migration 8 style |
| RLS target | `TO authenticated` — matching Migration 8 style |
| Idempotency | `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` |
| `?? null` pattern | All optional mutation fields use `?? null` — but no mutations exist yet |
| TypeScript interface | `PascalCase` singular matching table name (`AmcContract`) |
| Extended type | `AmcContractWithDetails extends AmcContract` — matching `ServiceCardWithDetails` |
| Type aliases | `AmcContractStatus` and `AmcFrequency` union types — matching `JobStatus`, `ServiceType`, `ReminderStatus` |
| Field naming | `snake_case` matching DB columns |

---

## Assumptions Made During Implementation

| Assumption | Rationale |
|-----------|-----------|
| `frequency` is a persistence concern, not derived state | Determines visit cadence. Without it, the contract cannot describe when visits occur. Not derivable from other stored fields |
| `start_date` and `end_date` are both `NOT NULL` | A contract without bounds has no defined scope. Both are required for a valid contract |
| `ON DELETE SET NULL` for `service_cards.amc_contract_id` | Deleting a contract should not destroy service history. Service cards that were AMC visits become normal historical records. Matches the `technician_id` FK pattern |
| No `updated_at` column | Only `customer_intelligence` has `updated_at` and it's set manually. No trigger-based auto-update exists anywhere. Omitting it is consistent |
| `service_template` reuses the canonical `ServiceGroup[]` structure | The `buildServiceDetails` function produces the exact JSON shape. AMC contracts should store the same format so visit generation can copy `service_template → service_details` directly |

---

## Verification Checklist

- [x] `npm run typecheck` — passes (0 errors)
- [x] `npm run build` — passes (2241 modules, 20 chunks)
- [x] All existing migrations apply cleanly (no migration changes)
- [x] New migration is idempotent (all IF NOT EXISTS / IF NOT EXISTS guards)
- [x] No existing workflows, queries, mutations, or components were modified
- [x] No business logic introduced
- [x] No scheduling logic introduced
- [x] No UI changes
- [x] No new dependencies introduced
- [x] TypeScript types match database schema exactly

---

## Concerns and Follow-Up Work (Deferred to Future PRs)

| Concern | Target PR |
|---------|-----------|
| Queries and mutations for `amc_contracts` CRUD | PR 2 — Domain Layer |
| Visit generation from contracts (cron or service) | PR 3 — Scheduling |
| AMC-aware lifecycle state (`deriveCustomerIntelligence` wrapper) | PR 2 — Domain Layer |
| `AmcContractStatus` label mapping (like `SERVICE_TYPE_LABELS`) | PR 2 — Domain Layer |
| Realtime publication (`ALTER PUBLICATION supabase_realtime ADD TABLE amc_contracts`) | PR 2 or later — only needed if UI subscribes |
| `updated_at` column with trigger (if AMC contracts need modification tracking) | PR 2 or later |
| Seed data for AMC contracts | PR 2 or later |
