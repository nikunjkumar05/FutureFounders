# Canonical Consumer Migration — Architecture Investigation

## 1. Consumer Inventory

### Consumers identified

| # | Consumer | File | Function(s) | Business Purpose | Read/Write | Current Source of Truth |
|---|----------|------|-------------|-----------------|-----------|------------------------|
| C1 | **Job Created** | `src/lib/queries.ts:117` | `useCreateJob()` | Create new service card with next_service_date | Write | Computes `next_service_date = serviceDate + 180d` locally |
| C2 | **Job Status Updated** | `src/lib/queries.ts:77` | `useUpdateJobStatus()` | Mark job completed, set next_service_date, refresh CI | Write | Computes `next_service_date = serviceDate + 180d`; calls `refreshCustomerIntelligence()` |
| C3 | **Job Updated** | `src/lib/queries.ts:758` | `useUpdateJob()` | Edit job details, recompute next_service_date | Write | Re-computes `next_service_date = serviceDate + 180d` locally |
| C4 | **Job Deleted** | `src/lib/queries.ts:834` | `useDeleteJob()` | Delete a service card | Write | Raw DB delete, no lifecycle consideration |
| C5 | **Reminder Sent** | `src/lib/queries.ts:431` | `useMarkReminderSent()` | Mark `reminder_sent_at` on service card | Write | Direct column update; no reminder_responses row created |
| C6 | **Reminder Response Created** | `src/lib/queries.ts:1513` | `useCreateReminderResponse()` | Record reminder response, refresh CI | Write | Inserts reminder_responses row; calls `refreshCustomerIntelligence()` |
| C7 | **CI Manual Override** | `src/lib/queries.ts:1560` | `useUpdateCustomerIntelligence()` | Upsert CI record directly | Write | Direct upsert bypassing derivation |
| C8 | **Send Reminders Cron (Vercel)** | `api/cron/send-reminders.ts` | Handler | Send WhatsApp reminders to due customers | Write + Read | SQL: `next_service_date <= today AND reminder_sent_at IS NULL AND job_status = pending` |
| C9 | **Send Reminders Cron (Express)** | `api/server.js:646` | `/api/cron/send-reminders` | Duplicate of C8 | Write + Read | Same SQL filter as C8 |
| C10 | **Send Reminders (Edge Function)** | `supabase/functions/send-reminders/index.ts` | Handler | Duplicate of C8 (Deno) | Write + Read | Same SQL filter, missing CI refresh and reminder_responses |
| C11 | **Daily Briefing Cron (Vercel)** | `api/cron/daily-briefing.ts` | Handler | Send daily ops briefing to merchant | Read | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` |
| C12 | **Daily Briefing Cron (Express)** | `api/server.js:688` | `/api/cron/daily-briefing` | Duplicate of C11 | Read | Same SQL filter as C11 |
| C13 | **Weekly Revenue Insight Cron (Vercel)** | `api/cron/weekly-revenue-insight.ts` | Handler | Send weekly revenue summary | Read | SQL: `next_service_date >= monthStart AND <= monthEnd`; own revenue est. with flat ₹1200 fallback |
| C14 | **Weekly Revenue Insight Cron (Express)** | `api/server.js:785` | `/api/cron/weekly-revenue-insight` | Duplicate of C13 | Read | Same as C13 |
| C15 | **Webhook — Reminder Response** | `api/webhook/index.ts:150` | Inline handleYesResponse | Customer says "yes"/"confirm"/"haan" | Write | Patches `reminder_responses.status = 'responded'`; calls `refreshCustomerIntelligence()` |
| C16 | **Webhook — Booking Created** | `api/webhook/index.ts:172` | Inline handleTimeSlot | Customer selects morning/afternoon | Write | Creates `service_cards` (pending), patches reminder to "booked", calls `refreshCustomerIntelligence()` |
| C17 | **Webhook — Job Completed (staff)** | `api/webhook/index.ts:323` | Inline handleStaffDone | Staff says "done"/"completed" | Write | Patches `service_cards.job_status = 'completed'`, calls `refreshCustomerIntelligence()` |
| C18 | **Webhook Express — Reminder Response** | `api/server.js:535` | Inline handler | Duplicate of C15 | Write | Same logic, NO `refreshCustomerIntelligence()` call |
| C19 | **Webhook Express — Booking Created** | `api/server.js:543` | Inline handler | Duplicate of C16 | Write | Same logic, NO `refreshCustomerIntelligence()` call |
| C20 | **Webhook Express — Job Completed** | `api/server.js:609` | Inline handler | Duplicate of C17 | Write | Same logic, NO `refreshCustomerIntelligence()` call |
| C21 | **Webhook Express — AI Booking** | `api/server.js:230` | handleFAQ / book_cleaning_service tool | AI-driven booking | Write | Creates customer (upsert) + service_cards; no CI refresh, no next_service_date |
| C22 | **Dashboard Metrics** | `src/lib/queries.ts:507` | `useDashboardMetrics()` | KPI counts for dashboard | Read | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` for due reminders count |
| C23 | **Time Saved Metrics** | `src/lib/queries.ts:449` | `useTimeSavedMetrics()` | Time-saved calculation for dashboard | Read | Count queries: `reminder_sent_at` not null, `responded_at` not null |
| C24 | **Daily Briefing UI** | `src/lib/queries.ts:1108` | `useDailyBriefing()` | Briefing data for DailyBriefing component | Read | SQL: `next_service_date <= today AND reminder_sent_at IS NULL`; own workload classification |
| C25 | **Revenue Intelligence** | `src/lib/queries.ts:1294` | `useRevenueIntelligence()` | Full revenue dashboard | Read | Fetches ALL cards + reminders + CI; calls `deriveCustomerIntelligence()` directly; own segment bucketing, revenue calcs, insight generation |
| C26 | **Customers Page — Reminder Send** | `src/pages/Customers.tsx` | Reminder button | Manually send reminder to any customer | Write | Calls `useMarkReminderSent()` + `useCreateReminderResponse()`; no lifecycle eligibility check |
| C27 | **Customer List — Row Computation** | `src/pages/Customers.tsx` | `buildCustomerRow()` | Compute per-row totals (totalJobs, activeJobs) | Read | Local JS filter: `cards.filter(c => c.customer_id === id)` |
| C28 | **Customer Intelligence Persistence** | `src/lib/customer-intelligence-sync.ts:22` | `refreshCustomerIntelligence()` | Derive CI for one customer, persist to DB | Write | Calls `deriveCustomerIntelligence()` + upsert |
| C29 | **CI Backfill** | `src/lib/customer-intelligence-backfill.ts` | `backfillCustomerIntelligence()` | Rebuild CI for all customers | Write | Calls `refreshCustomerIntelligence()` in batch |
| C30 | **Customer Migration Script** | `scripts/migrate-customers.js` | — | Bulk CSV import | Write | Computes `next_service_date = lastServiceDate + 180d`; no CI refresh |
| C31 | **Webhook Edge Function** | `supabase/functions/webhook/index.ts` | Handler | Staff check-in/checkout + AI FAQ | Write | No lifecycle logic; only staff operations |

---

## 2. Business Logic Inventory

For each consumer, the duplicated business logic currently implemented locally:

| Consumer | Duplicated Logic | Where implemented |
|----------|-----------------|-------------------|
| C1 (useCreateJob) | `next_service_date = serviceDate + 180d` | `queries.ts:129-131` |
| C2 (useUpdateJobStatus) | `next_service_date = serviceDate + 180d` | `queries.ts:82-94` |
| C3 (useUpdateJob) | `next_service_date = serviceDate + 180d` | `queries.ts:772-774` |
| C4 (useDeleteJob) | No lifecycle logic (raw delete) | — |
| C5 (useMarkReminderSent) | Sets `reminder_sent_at` without creating `reminder_responses` | `queries.ts:437` |
| C6 (useCreateReminderResponse) | Creates reminder_responses, calls refreshCustomerIntelligence | `queries.ts:1513-1558` |
| C7 (useUpdateCustomerIntelligence) | Bypasses derivation entirely (manual override) | `queries.ts:1560-1588` |
| C8 (Send Reminders Vercel) | "Due customer" filter: `next_service_date <= today AND reminder_sent_at IS NULL AND job_status = pending` | `cron/send-reminders.ts:46-47` |
| C9 (Send Reminders Express) | Same filter as C8 | `server.js:658` |
| C10 (Send Reminders Edge) | Same filter as C8 | `supabase/functions/send-reminders/index.ts:30-31` |
| C11 (Daily Briefing Vercel) | "Reminder due" filter: `next_service_date <= today AND reminder_sent_at IS NULL` | `cron/daily-briefing.ts:169-171` |
| C12 (Daily Briefing Express) | Same filter as C11 | `server.js:715` |
| C13 (Weekly Revenue Vercel) | "Due this month" filter: `next_service_date >= monthStart AND <= monthEnd`; own revenue estimation with flat ₹1200 fallback; non-responder detection | `cron/weekly-revenue-insight.ts:44-53` |
| C14 (Weekly Revenue Express) | Same as C13 | `server.js:795-806` |
| C15 (Webhook — Response) | Patches reminder_responses, calls refreshCustomerIntelligence | `webhook/index.ts:150-171` |
| C16 (Webhook — Booking) | Creates service_cards (pending), patches reminder status, calls refreshCustomerIntelligence | `webhook/index.ts:172-232` |
| C17 (Webhook — Completed) | Patches job_status, calls refreshCustomerIntelligence | `webhook/index.ts:323-352` |
| C18 (Webhook Express — Response) | Same as C15, NO refreshCustomerIntelligence | `server.js:535-542` |
| C19 (Webhook Express — Booking) | Same as C16, NO refreshCustomerIntelligence | `server.js:543-555` |
| C20 (Webhook Express — Completed) | Same as C17, NO refreshCustomerIntelligence | `server.js:609-626` |
| C21 (Webhook Express AI Booking) | Creates customer + card; NO `next_service_date`, NO CI refresh | `server.js:230-267` |
| C22 (useDashboardMetrics) | "Due reminders" count: `next_service_date <= today AND reminder_sent_at IS NULL` | `queries.ts:531-536` |
| C23 (useTimeSavedMetrics) | Reminder sent count, response count (aggregate, no derivation) | `queries.ts:462-470` |
| C24 (useDailyBriefing) | "Reminder due" filter + list building; workload classification (High/Medium/Low); delay detection | `queries.ts:1149-1153, 1231-1259` |
| C25 (useRevenueIntelligence) | "Due this month" + "overdue" filters; calls `deriveCustomerIntelligence()` directly; own segment bucketing; own revenue forecast & confirmation logic; own insight generation | `queries.ts:1335-1480` |
| C26 (Customers Page) | Manual reminder send with NO lifecycle eligibility check | `Customers.tsx` |

---

## 3. Canonical Mapping

Every duplicated business rule mapped to its canonical owner:

| Business Rule | Duplicated In | Should Migrate To | Notes |
|---------------|---------------|-------------------|-------|
| `next_service_date = serviceDate + 180d` | C1, C2, C3, C30 | **Consumer-specific** (data mutation, not derivation) | This is a data computation during write, not a lifecycle derivation. Belongs in the write path, not in either canonical component. |
| "Due customer" filter (`next_service_date <= today AND reminder_sent_at IS NULL AND job_status = pending`) | C8, C9, C10 | **Lifecycle Transition Engine** → `reminderEligible` from `evaluateCustomerAttention()` | The pipeline already exposes `reminderEligible: lifecycleState === 'ready_to_book'`. The cron should use this instead of the raw SQL filter. |
| "Reminder due" filter (`next_service_date <= today AND reminder_sent_at IS NULL`) | C11, C12, C22, C24 | **Customer Attention Pipeline** → `reminderEligible` | Same replacement. `reminderEligible` is the canonical answer to "does this customer need a reminder?" |
| "Due this month" filter | C13, C14, C25 | **Customer Attention Pipeline** (new field needed) | The pipeline does not currently expose `isDueThisMonth`. Revenue Intelligence needs this for forecasting. Could add `dueThisMonth: boolean` to `CustomerAttentionResult`. |
| Active-job override | C25 | **Customer Attention Pipeline** (already implemented) | Already part of the pipeline via `customerHasActiveJob` → `scheduled` state. |
| Segment classification (ready_to_book / follow_up_needed / high_churn_risk) | C25 | **Customer Attention Pipeline** (already implemented) | Already part of the pipeline as `lifecycleState`. |
| Revenue estimation | C13, C14, C25 | **Customer Attention Pipeline** (already exposed as `estimatedRevenue`) | Already part of the pipeline. Both Revenue Intelligence and Weekly Revenue should use it. |
| Revenue confirmation logic (reminder status 'booked'/'responded') | C25 | **Consumer-specific** | Confirmed revenue depends on which cards fall within the current month. This is a presentation/aggregation concern. |
| Reminder analytics (sent/responded/booked counts, conversion rate) | C25 | **Consumer-specific** | Aggregate analytics over all reminders, not per-customer lifecycle. |
| Insight generation (overdue >30 days, recoverable revenue, etc.) | C25 | **Consumer-specific** | Presentation logic: aggregating results into human-readable insights. |
| Workload classification (High/Medium/Low) | C24 | **Consumer-specific** | Based on job count, not lifecycle state. |
| Delay detection (unchecked workers) | C24 | **Consumer-specific** | Based on attendance, not lifecycle. |
| Inventory risk classification | C11, C24 | **Consumer-specific** | Not lifecycle-related. |
| `reminder_sent_at` column update | C5, C26 | **Legacy — should retire** | The canonical approach records reminders in `reminder_responses` table. The `reminder_sent_at` column on `service_cards` is a legacy proxy. |
| Manual CI override | C7 | **Consumer-specific (escape hatch)** | Explicitly designed as a manual override. Should not migrate. |
| Per-customer row computation (totalJobs, activeJobs) | C27 | **Consumer-specific** | UI-only computation from fetched data. |

---

## 4. Consumer Responsibilities After Migration

### A. Core derivation (belongs in Customer Attention Pipeline)

| Consumer | Currently Does | Should Request From Pipeline | Retained Responsibility |
|----------|---------------|------------------------------|------------------------|
| C22 (useDashboardMetrics) | SQL count of `next_service_date <= today AND reminder_sent_at IS NULL` | `evaluateCustomerAttentionBatch()` → aggregate `reminderEligible` count | Presentation formatting of KPI tiles |
| C24 (useDailyBriefing) | SQL filter + list building + workload classification | `evaluateCustomerAttentionBatch()` → `reminderEligible` customers list | Workload classification, delay detection, inventory alerts, briefing format |
| C25 (useRevenueIntelligence) | Full segment derivation via `deriveCustomerIntelligence()`, revenue calcs, insight generation | `evaluateCustomerAttentionBatch()` → `lifecycleState`, `estimatedRevenue`, `daysOverdue`, `healthScore` | Revenue forecasting aggregation (expected/confirmed/atRisk), reminder analytics, insight generation |
| C11/C12 (Daily Briefing Cron) | SQL filter for due reminders | `evaluateCustomerAttentionBatch()` → `reminderEligible` customers | Briefing message formatting, WhatsApp sending |
| C13/C14 (Weekly Revenue Cron) | SQL filter + own revenue estimation + non-responder detection | `evaluateCustomerAttentionBatch()` → `estimatedRevenue`, `reminderState` | Message formatting, WhatsApp sending |

### B. Event-driven transition (belongs in Lifecycle Transition Engine)

| Consumer | Currently Does | Should Request From Engine | Retained Responsibility |
|----------|---------------|---------------------------|------------------------|
| C1 (useCreateJob) | Computes `next_service_date` locally; no CI refresh | Call `evaluateTransition({ type: 'job_created' })` after DB write | The actual DB write + next_service_date computation (data mutation) |
| C2 (useUpdateJobStatus) | Computes `next_service_date` locally; calls `refreshCustomerIntelligence()` | Call `evaluateTransition({ type: 'job_completed' })` after DB write | The actual DB write + next_service_date computation |
| C6 (useCreateReminderResponse) | Creates reminder_responses; calls `refreshCustomerIntelligence()` | Call `evaluateTransition({ type: 'reminder_sent'/'reminder_responded'/'reminder_booked'/'reminder_ignored' })` after DB write | The actual DB write |
| C15 (Webhook — Response) | Patches reminder_responses; calls `refreshCustomerIntelligence()` | Call `evaluateTransition({ type: 'reminder_responded' })` after DB write | The actual DB write |
| C16 (Webhook — Booking) | Creates card; patches reminder; calls `refreshCustomerIntelligence()` | Call `evaluateTransition({ type: 'reminder_booked' })` after DB write | The actual DB writes |
| C17 (Webhook — Completed) | Patches job_status; calls `refreshCustomerIntelligence()` | Call `evaluateTransition({ type: 'job_completed' })` after DB write | The actual DB write |
| C8/C9/C10 (Send Reminders) | SQL filter + send + update + CI refresh | Call `evaluateTransition({ type: 'reminder_sent' })` after each send | WhatsApp sending logic, rate limiting, retry |
| C26 (Customers Page) | Sends reminder with no eligibility check | Use `evaluateCustomerAttention()` to check `reminderEligible` before showing send button | UI rendering, WhatsApp send trigger |

### C. Purely consumer-specific (no change)

| Consumer | Why No Change |
|----------|--------------|
| C4 (useDeleteJob) | No lifecycle logic; raw DB delete |
| C7 (useUpdateCustomerIntelligence) | Deliberate manual override escape hatch |
| C20 (Webhook Express — Staff Done) | Deprecated path; should retire, not migrate |
| C21 (Webhook Express AI Booking) | Deprecated path; should retire, not migrate |
| C27 (Customers Page — Row Computation) | Pure UI computation from fetched data |
| C28 (CI Sync) | The persistence layer; takes pipeline output and persists it |
| C29 (CI Backfill) | One-time operation |
| C30 (Migration Script) | One-time operation |
| C31 (Webhook Edge Function) | Staff-only operations; no lifecycle logic |

---

## 5. Migration Dependencies

### Dependency graph

```
                  ┌─────────────────────┐
                  │ Customer Attention   │
                  │ Pipeline (PR 6)      │
                  └──────────┬──────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
   ┌─────────────────────┐     ┌─────────────────────┐
   │ Lifecycle Transition │     │ Revenue Intelligence │
   │ Engine (PR 7)        │     │ (C25)                │
   └──────────┬──────────┘     └─────────────────────┘
              │                              
     ┌────────┼────────┐                     
     ▼        ▼        ▼                     
   C1,C2    C6,C15   C8,C9,C10              
   C3,C16   C17      C11,C12                
                     C22,C24                
```

### Migration order

| Phase | Consumers | Rationale |
|-------|-----------|-----------|
| **Phase 1** | C22 (useDashboardMetrics), C24 (useDailyBriefing) | Read-only consumers with simplest migration. No data mutation risk. Validates pipeline outputs against legacy SQL. |
| **Phase 2** | C25 (useRevenueIntelligence) | The most complex consumer. Must come after Phase 1 validates pipeline correctness, because Revenue Intelligence depends heavily on the same derived states. |
| **Phase 3** | C11/C12 (Daily Briefing Cron), C13/C14 (Weekly Revenue Cron) | Cron consumers analogous to the UI consumers in Phase 1 but with WhatsApp sending. Lower risk than write-side consumers. |
| **Phase 4** | C8/C9/C10 (Send Reminders Cron) | Write-side consumer. After Phase 1-3 validate that `reminderEligible` matches the legacy SQL filter, the cron can safely use it to decide whom to message. |
| **Phase 5** | C1/C2/C3 (Job mutations), C6 (Reminder response), C15/C16/C17 (Webhooks) | The highest-risk consumers because they mutate data AND trigger lifecycle transitions. Must wait until the engine's `evaluateTransition` has been validated end-to-end by the read-side phases. |
| **Retire** | C5 (useMarkReminderSent), C9/C10/C14/C18/C19/C20/C21 (Express + Edge duplicates) | Deprecated consumers that should be removed entirely, not migrated. |

### Consumers that must migrate together

| Group | Consumers | Reason |
|-------|-----------|--------|
| G1 | C22 (Dashboard), C24 (Daily Briefing) | Both use same SQL filter for "reminder due" count. Should switch together to avoid dashboard showing different counts than briefing. |
| G2 | C8 (Send Reminders Vercel), C11 (Daily Briefing Vercel) | Both crons run on the same infrastructure. The "reminder due" filter must be consistent between who gets reminded (C8) and what gets reported (C11). |
| G3 | C15 (Webhook Response), C16 (Webhook Booking), C17 (Webhook Completed) | All three are event handlers in the same webhook file. They share state and are called in sequence during a single customer interaction. Partially migrating one would create inconsistency. |
| G4 | C1 (useCreateJob), C2 (useUpdateJobStatus), C6 (useCreateReminderResponse) | All three are mutations in `queries.ts` that call `refreshCustomerIntelligence()`. They should switch to the engine together. |

### Shared code paths

| Shared Code | Used By | Migration Impact |
|-------------|---------|-----------------|
| `refreshCustomerIntelligence()` (queries.ts:1288) | C2, C6 | Will be replaced by `evaluateTransition()` calls. The CI sync layer will still persist the result. |
| `deriveCustomerIntelligence()` (customer-intelligence.ts) | C25, C28 | C25 should stop calling it directly (use pipeline instead). C28 continues to use it (persistence layer). |
| `buildLatestCompletedByCustomer()` (customer-intelligence.ts) | C25 | Will be internalized by the pipeline. C25 should not call it directly. |
| `findLatestReminder()` (customer-intelligence.ts) | C25 | Will be internalized by the pipeline. C25 should not call it directly. |
| SQL filter: `next_service_date <= today AND reminder_sent_at IS NULL` | C8, C9, C10, C11, C12, C22, C24 | All should be replaced by pipeline's `reminderEligible`. |
| SQL filter: `next_service_date >= monthStart AND <= monthEnd` | C13, C14, C25 | Replacement depends on whether `dueThisMonth` is added to pipeline output. |
| `estimateServiceValue()` (customer-intelligence.ts) | C25 | C25 should use pipeline's `estimatedRevenue` instead. |

---

## 5.5 Migration Boundaries

### Consumers that should migrate completely during PR 8

| Consumer | Priority | Rationale |
|----------|----------|-----------|
| C22 (useDashboardMetrics) | **Must migrate** | Simplest consumer. Direct replacement of SQL count with pipeline call. Validates pipeline for all subsequent phases. |
| C24 (useDailyBriefing) | **Must migrate** | Direct replacement of SQL reminder list with pipeline call. Keeps workload/delay/inventory logic unchanged. |
| C25 (useRevenueIntelligence) | **Must migrate** | The primary consumer of lifecycle derivation. Cannot remain on legacy while others migrate. Highest architectural impact. |
| C11/C12 (Daily Briefing Cron) | **Should migrate** | Analogous to C24 but on the cron side. Keeps derivation consistent between UI and cron. |
| C13/C14 (Weekly Revenue Cron) | **Should migrate** | Analogous to C25 but on the cron side. |

### Consumers that should NOT migrate during PR 8

| Consumer | Rationale |
|----------|-----------|
| C8/C9/C10 (Send Reminders Cron) | Higher risk (write-side + WhatsApp). Better to validate pipeline on read-side first, then migrate in a follow-up PR. |
| C1/C2/C3 (Job mutations) | Highest risk (DB writes + lifecycle transitions). Engine integration requires careful testing. |
| C5 (useMarkReminderSent) | Should be retired, not migrated. |
| C6/C15/C16/C17 (Reminder + Webhook events) | Write-side consumers. Requires engine integration. Follow-up PR. |
| C18/C19/C20/C21 (Express duplicates) | Should be retired, not migrated. |
| C26 (Customers Page) | Low risk but low priority. UI eligibility check is a nice-to-have. |

### Workflows that must migrate together

| Workflow | Consumers | Why |
|----------|-----------|-----|
| **Dashboard KPI** | C22 (Dashboard metrics), C24 (Daily briefing data) | Both derive "reminder due" count from same data. Migrating one without the other would show inconsistent counts in the UI. |
| **Revenue Intelligence** | C25 alone | No other consumer shares the full revenue derivation. But C25 depends on the same `lifecycleState` that C22/C24 use. C25 must wait until Phase 1 validates the pipeline. |
| **Weekly Revenue + Dashboard** | C13/C14 (Weekly Revenue Cron), C25 (Revenue Intelligence) | Both compute "due this month" customers and estimated revenue. The cron sends totals while the UI shows details. They should derive from the same source. |

### Partial migration risk

A workflow should **never** simultaneously depend on both legacy and canonical derivation for the same business concept. The following are NOT acceptable:

- ❌ Dashboard uses pipeline for `reminderEligible` count while Revenue Intelligence uses legacy SQL for the same customer set
- ❌ Daily Briefing cron uses pipeline while Daily Briefing UI uses legacy SQL
- ❌ Webhook uses engine for `job_completed` but `useUpdateJobStatus` uses legacy `refreshCustomerIntelligence()`

---

## 6. API Gap Analysis

### Customer Attention Pipeline (`evaluateCustomerAttention`)

**Currently exposed:**

| Output | Type | Used By After Migration |
|--------|------|------------------------|
| `lifecycleState` | `LifecycleState` | C22, C24, C25, C11, C12, C13, C14 |
| `attentionState` | `AttentionState` | C22, C24 |
| `requiredAction` | `RequiredAction` | C24, C11, C12 |
| `reminderEligible` | `boolean` | C8, C9, C10, C22, C24, C11, C12 |
| `reminderState` | `ReminderState` | C13, C14, C25 |
| `daysOverdue` | `number` | C25 |
| `healthScore` | `number` | C25 |
| `estimatedRevenue` | `number` | C13, C14, C25 |
| `customerName` | `string` | C24, C11, C12 |
| `customerPhone` | `string` | C11, C12 |
| `lifecycleAnchorId` | `string` | C25 (for confirmed revenue logic) |
| `lifecycleAnchorDate` | `string` | C25 |
| `nextServiceDate` | `string \| null` | C24, C25 |
| `reason` | `string` | C25 (for insights) |

**Missing outputs needed by consumers:**

| Missing | Needed By | Use Case |
|---------|-----------|----------|
| `dueThisMonth: boolean` | C13, C14, C25 | Revenue forecasting needs to know if a customer's `next_service_date` falls within the current calendar month. Currently derived from raw `next_service_date` in SQL. |
| `overdue: boolean` | C25 | Currently derived as `next_service_date < today AND job_status != 'completed'`. Could be inferred from `daysOverdue > 0` but the additional `job_status != 'completed'` filter is revenue-specific. |
| `lifecycleAnchorCustomerId: string` | C24, C11, C12 | Daily briefing needs to group reminders by customer. Currently joined from service_cards. Available as `customerId` on the pipeline input but not explicitly on the result. Actually, `customerId` IS on the result. Not missing. |

**Unnecessary outputs for some consumers:**

| Output | Not Needed By | Notes |
|--------|---------------|-------|
| `healthScore` | C22, C24, C11, C12 | Dashboard and briefing don't display health score |
| `estimatedRevenue` | C22, C24, C11, C12 | Dashboard and briefing don't display revenue |
| `lifecycleAnchorId` | C22, C24, C11, C12 | Not needed for KPI counts or reminder lists |
| `lifecycleAnchorDate` | C22, C24, C11, C12 | Not needed |
| `reason` | C22, C24, C11, C12 | Not needed |

**Opportunities to simplify interfaces:**
- The pipeline is already reasonably factored. No major changes needed.
- Adding `dueThisMonth` would reduce duplication in Revenue Intelligence.

### Lifecycle Transition Engine (`evaluateTransition`)

**Currently exposed:**

| Output | Needed By |
|--------|-----------|
| `lifecycleState` | C1, C2, C6, C15, C16, C17 (callers after mutation) |
| `previousLifecycleState` | C1, C2, C6 (for transition detection) |
| `transitionType` | C1, C2, C6 (for logging/analytics) |
| `didAnchorChange` | C1, C2 (for cache invalidation) |
| `didReminderStateChange` | C6, C15, C16 (for notification decisions) |
| `changeDescription` | All (for audit logging) |

**Gaps:**
- No gap identified. The engine exposes everything callers need to determine what happened as a result of an event.
- The engine currently requires the caller to pass `serviceCards` and `reminders` for the entire merchant. For write-side consumers (C1, C2, C6), they already have this data available from their DB write context.

---

## 7. Legacy Logic Removal

### Components that become fully obsolete after migration

| Code | File | Lines | Reason |
|------|------|-------|--------|
| "Due reminders" SQL filter | `queries.ts:531-536` (useDashboardMetrics) | Replaced by `evaluateCustomerAttention()` → `reminderEligible` |
| "Reminder due" SQL filter + list building | `queries.ts:1149-1153` (useDailyBriefing) | Replaced by `evaluateCustomerAttention()` → `reminderEligible` customers |
| Local `deriveCustomerIntelligence()` calls | `queries.ts:1364,1383` (useRevenueIntelligence) | Replaced by `evaluateCustomerAttentionBatch()` |
| Local `buildLatestCompletedByCustomer()` call | `queries.ts:1335` | Internalized by pipeline |
| Local `findLatestReminder()` calls | `queries.ts:1367,1386` | Internalized by pipeline |
| Local `estimateServiceValue()` call | `queries.ts:1405` | Replaced by pipeline's `estimatedRevenue` |
| "Due customer" SQL filter in cron | `api/cron/send-reminders.ts:46-47` | Replaced by `evaluateCustomerAttention()` → `reminderEligible` |
| "Due this month" SQL filter in cron | `api/cron/weekly-revenue-insight.ts:44-46` | Replaced by pipeline (with `dueThisMonth` addition) |
| Flat ₹1200 revenue fallback | `api/cron/weekly-revenue-insight.ts` | Replaced by pipeline's `estimatedRevenue` |
| Non-responder detection in cron | `api/cron/weekly-revenue-insight.ts:51-53` | Replaced by pipeline's `reminderState` |
| `refreshCustomerIntelligence()` calls | Multiple files | Replaced by `evaluateTransition()` calls (persistence layer remains) |

### Components that should be retired entirely

| Component | File | Reason |
|-----------|------|--------|
| `useMarkReminderSent()` | `queries.ts:431` | Legacy path; canonical reminder tracking goes through `reminder_responses` table |
| Express cron duplicates | `api/server.js:646-739` | Redundant with Vercel cron + Express is not suitable for cron workloads |
| Express webhook duplicates | `api/server.js:535-626` | Redundant with Vercel webhook + Express is not suitable for production |
| Edge Function send-reminders | `supabase/functions/send-reminders/index.ts` | Incomplete (no CI refresh, no reminder_responses) |
| Edge Function webhook | `supabase/functions/webhook/index.ts` | Redundant with Vercel webhook; staff-only subset |

### Cache assumptions that become obsolete

| Assumption | Current Behavior | After Migration |
|------------|-----------------|-----------------|
| `reminder_sent_at` column is the authoritative source for "reminder sent" status | Cron and dashboard check this column | `reminder_responses` table + pipeline derivation replace this |
| `customer_intelligence` table is the primary lifecycle state store | Written by `refreshCustomerIntelligence()`, read by dashboard | Pipeline derivation is the primary source; CI table becomes a cache |
| `next_service_date` on service_cards is the canonical "due date" | Used directly in SQL filters | Pipeline derives lifecycle state from all data including `next_service_date` |

---

## 8. Validation Strategy

### Per-consumer validation

| Consumer | Pre-migration Behaviour | Post-migration Behaviour | Regression Risk | Validation |
|----------|----------------------|------------------------|----------------|------------|
| C22 (useDashboardMetrics) | SQL: count of `next_service_date <= today AND reminder_sent_at IS NULL` | `evaluateCustomerAttentionBatch()` → count of `reminderEligible === true` | Count mismatch if pipeline logic diverges from SQL | Run both queries in parallel; compare counts; assert identical |
| C24 (useDailyBriefing) | SQL: list of cards where `next_service_date <= today AND reminder_sent_at IS NULL` | `evaluateCustomerAttentionBatch()` → list where `reminderEligible === true` | List contents differ | Run both in parallel; compare customer IDs; assert identical |
| C25 (useRevenueIntelligence) | Full custom derivation via `deriveCustomerIntelligence()` | `evaluateCustomerAttentionBatch()` → use `lifecycleState`, `estimatedRevenue`, etc. | Segment counts differ; revenue totals differ | Run both derivations in parallel; compare segment counts per state; compare per-customer `estimatedRevenue` |
| C11/C12 (Daily Briefing Cron) | SQL filter → build message | Pipeline `reminderEligible` → build message | Different customers in briefing | Same as C24 validation, then verify WhatsApp output unchanged |
| C13/C14 (Weekly Revenue Cron) | SQL filter + own calcs | Pipeline outputs | Wrong revenue totals | Run both in parallel; compare revenue figures; compare non-responder lists |
| C8/C9/C10 (Send Reminders) | SQL filter for who to message | Pipeline `reminderEligible` for who to message | Wrong customers messaged | HIGH RISK. Must run both in parallel for a dry-run period before switching. |

### Regression detection strategy

1. **Parallel-run validation**: Deploy with both legacy and canonical logic active. Log discrepancies but act on legacy logic. Compare outputs for N days before switching.
2. **Staged rollout**: Migrate read-side consumers first (no data mutation), then write-side consumers.
3. **Feature flag**: Control migration per-consumer with a configuration flag. Allows instant rollback.
4. **CI comparison endpoint**: Create a temporary admin endpoint that returns both legacy and pipeline results for a given customer/merchant to compare during migration.

### Rollback strategy

| Scenario | Rollback Action |
|----------|----------------|
| Pipeline returns wrong lifecycleState | Flip feature flag back to legacy; investigate pipeline logic |
| Pipeline has performance regression | Move `evaluateCustomerAttentionBatch()` to server-side; keep flag |
| Engine transition misclassifies event | Roll back engine-consuming mutations; keep read-side pipeline |
| Revenue totals diverge | Roll back Revenue Intelligence to legacy deriveCustomerIntelligence; keep dashboard on pipeline |

---

## 9. Migration Risk Assessment

| Risk | Severity | Affected Consumers | Mitigation |
|------|----------|-------------------|------------|
| **Partial migration**: Dashboard uses pipeline while Revenue Intelligence uses legacy SQL for same concept | High | C22, C25 | Enforce migration boundaries (G1 must migrate together). Add CI assertion that prevents mixing. |
| **Mixed old/new derivation**: Webhook uses engine for job_completed but useUpdateJobStatus uses legacy refreshCustomerIntelligence | High | C2, C17 | Both must migrate in same phase (Phase 5). Enforce boundary. |
| **Stale CI cache**: Pipeline reads live data but CI table still has stale segment | Medium | C25 | Revenue Intelligence currently uses CI table for `storedSegment`. After migration, it should use pipeline output (which reads live data) instead of the CI cache. The `storedSegment` parameter in `CustomerIntelligenceInput` becomes less important. |
| **Duplicate refreshes**: Both engine and legacy refreshCustomerIntelligence fire for same event | Medium | C1, C2, C6 | During transition, disable legacy CI refresh when engine is active. Feature flag controls this. |
| **Inconsistent reminder state**: Pipeline derives `reminderState` from `reminder_responses` while legacy `useMarkReminderSent` only sets `reminder_sent_at` | Medium | C5, C26 | Retire `useMarkReminderSent`. Ensure all reminder sends go through `useCreateReminderResponse`. |
| **Race condition — cron fires during webhook handler**: Both modify same customer's data | Low | C8, C15 | The cron already has 300ms delay between customers. Webhook is per-customer. Risk is low because they operate on different customers. |
| **Operational ordering — cron sends reminder before webhook processes response**: Customer responds quickly before cron checks eligibility | Low | C8 | The cron's SQL filter (`reminder_sent_at IS NULL`) already handles this. Pipeline's `reminderEligible` must match this behaviour. Verified in Phase 1. |
| **Performance — batch evaluation of all customers**: Revenue Intelligence evaluates all customers in a single `evaluateCustomerAttentionBatch` call | Medium | C25 | Profile the batch call. If too slow, consider server-side evaluation or pagination. The legacy `useRevenueIntelligence` already fetches ALL data and derives in-memory, so pipeline should not be slower. |
| **Missing `dueThisMonth` field**: Pipeline doesn't expose whether a customer is due this month | High | C25 | Add `dueThisMonth: boolean` to `CustomerAttentionResult`. Until then, Revenue Intelligence must keep its own month-filter logic, creating a partial migration. |

---

## 10. Final Migration Roadmap

### Recommended split into multiple PRs

PR 8 should be divided into **3 implementation PRs** to manage risk:

| PR | Focus | Consumers | Complexity | Risk |
|----|-------|-----------|------------|------|
| **PR 8a** | **Read-side pipeline adoption** | C22 (Dashboard), C24 (Daily Briefing), C11/C12 (Daily Briefing Cron), C13/C14 (Weekly Revenue Cron) | Low-Medium | Low |
| **PR 8b** | **Revenue Intelligence migration** | C25 (Revenue Intelligence) | High | Medium |
| **PR 8c** | **Engine integration + write-side** | C1, C2, C6, C8, C15, C16, C17 + retire C5, C9, C10, C18-C21 | High | High |

### Detailed roadmap

#### PR 8a — Read-side pipeline adoption (recommended scope)

| Consumer | Migration Steps |
|----------|----------------|
| C22 (useDashboardMetrics) | 1. Replace SQL count with `evaluateCustomerAttentionBatch(merchantData)` → `results.filter(r => r.reminderEligible).length` 2. Remove legacy SQL for due reminders count |
| C24 (useDailyBriefing) | 1. Add `evaluateCustomerAttentionBatch()` call alongside existing queries 2. Replace `BriefingReminder[]` derivation with pipeline results 3. Keep workload/delay/inventory logic unchanged |
| C11/C12 (Daily Briefing Cron) | 1. Same pipeline integration as C24 2. Verify WhatsApp output unchanged |
| C13/C14 (Weekly Revenue Cron) | 1. Add `evaluateCustomerAttentionBatch()` call 2. Replace revenue estimation with `estimatedRevenue` 3. Replace non-responder detection with `reminderState` 4. Keep message formatting unchanged |

**API changes needed**: Add `dueThisMonth: boolean` to `CustomerAttentionResult` (or compute it in the consumer from `nextServiceDate`).

**Validation**: Run legacy and canonical in parallel for 7 days. Log discrepancies. Assert zero divergence before proceeding to PR 8b.

#### PR 8b — Revenue Intelligence migration

| Consumer | Migration Steps |
|----------|----------------|
| C25 (useRevenueIntelligence) | 1. Remove direct calls to `deriveCustomerIntelligence()`, `buildLatestCompletedByCustomer()`, `findLatestReminder()` 2. Use `evaluateCustomerAttentionBatch()` to get `lifecycleState`, `estimatedRevenue`, `daysOverdue`, `healthScore` for all customers 3. Keep segment bucketing (readyToBook/followUpNeeded/highChurnRisk) but populate from `lifecycleState` instead of `customer.status` 4. Keep revenue forecasting aggregation logic (expected/confirmed/atRisk) but populate from pipeline `estimatedRevenue` 5. Keep reminder analytics (total sent/responded/booked/conversion) unchanged (aggregate over reminders, not per-customer) 6. Update confirmed revenue logic to use pipeline lifecycle data 7. Keep insight generation unchanged |

**Risk**: Highest impact consumer. If pipeline derivation diverges from `deriveCustomerIntelligence()`, revenue totals will shift.

**Validation**: Run legacy and canonical derivations in parallel for two full billing cycles (minimum 30 days). Compare:
- Segment counts per category
- Per-customer `estimatedRevenue` vs `expectedValue`
- `daysOverdue` values
- `healthScore` values
- Insight text (should be semantically equivalent)

#### PR 8c — Engine integration + write-side + retirement

| Consumer | Migration Steps |
|----------|----------------|
| C1 (useCreateJob) | Add `evaluateTransition({ type: 'job_created' })` call after successful DB write. Result determines new lifecycle state (can be logged/persisted). |
| C2 (useUpdateJobStatus) | Replace `refreshCustomerIntelligence()` call with `evaluateTransition({ type: 'job_completed' })`. |
| C6 (useCreateReminderResponse) | Replace `refreshCustomerIntelligence()` call with `evaluateTransition({ type: 'reminder_sent'/'reminder_responded'/'reminder_booked'/'reminder_ignored' })`. |
| C8 (Send Reminders Vercel) | Replace SQL filter with `evaluateCustomerAttention()` → `reminderEligible`. Keep WhatsApp sending unchanged. |
| C15 (Webhook Response) | Replace `refreshCustomerIntelligence()` call with `evaluateTransition({ type: 'reminder_responded' })`. |
| C16 (Webhook Booking) | Replace `refreshCustomerIntelligence()` call with `evaluateTransition({ type: 'reminder_booked' })`. |
| C17 (Webhook Completed) | Replace `refreshCustomerIntelligence()` call with `evaluateTransition({ type: 'job_completed' })`. |
| **Retire C5** | Delete `useMarkReminderSent()`. Replace all callers with `useCreateReminderResponse()`. |
| **Retire C9, C10, C14** | Remove Express cron duplicates, remove Edge Function send-reminders. |
| **Retire C18-C21** | Remove Express webhook duplicates. |
| **Deprecate `reminder_sent_at` column** | Stop writing to this column on `service_cards`. Pipeline derives reminder state from `reminder_responses` only. |

**Note for C8**: The cron also calls `refreshCustomerIntelligence()` after sending. This should be replaced by `evaluateTransition({ type: 'reminder_sent' })`. The engine result can then be persisted via the existing CI sync layer if needed.

---

## A. Migration Matrix

| Consumer | Uses Pipeline | Uses Engine | Derives Locally | Logic to Remove | Retained |
|----------|--------------|-------------|----------------|-----------------|----------|
| C1 (useCreateJob) | No | After PR 8c | `next_service_date = serviceDate + 180d` | `refreshCustomerIntelligence()` call | `next_service_date` computation (data mutation) |
| C2 (useUpdateJobStatus) | No | After PR 8c | `next_service_date = serviceDate + 180d` | `refreshCustomerIntelligence()` call | `next_service_date` computation |
| C3 (useUpdateJob) | No | After PR 8c | Same as C1 | Same as C1 | `next_service_date` computation |
| C4 (useDeleteJob) | No | No | None | None | Raw delete |
| C5 (useMarkReminderSent) | No | No | `reminder_sent_at` column update | **Entire function** | Nothing — retire |
| C6 (useCreateReminderResponse) | No | After PR 8c | `refreshCustomerIntelligence()` call | CI refresh | Reminder_responses insert |
| C7 (useUpdateCustomerIntelligence) | No | No | Direct CI upsert (escape hatch) | None | Manual override |
| C8 (Send Reminders Vercel) | After PR 8a/c | After PR 8c | SQL filter + CI refresh | SQL filter + CI refresh | WhatsApp sending, rate limiting |
| C9 (Send Reminders Express) | — | — | — | **Entire route** | Retire |
| C10 (Send Reminders Edge) | — | — | — | **Entire function** | Retire |
| C11/C12 (Daily Briefing Cron) | After PR 8a | No | SQL reminder filter | SQL filter | Briefing formatting, WhatsApp |
| C13/C14 (Weekly Revenue Cron) | After PR 8a | No | SQL due-this-month filter + revenue + non-responder | SQL filter, own revenue, own non-responder | Message formatting, WhatsApp |
| C15 (Webhook — Response) | No | After PR 8c | `refreshCustomerIntelligence()` | CI refresh | DB writes, WhatsApp replies |
| C16 (Webhook — Booking) | No | After PR 8c | `refreshCustomerIntelligence()` | CI refresh | DB writes, WhatsApp replies |
| C17 (Webhook — Completed) | No | After PR 8c | `refreshCustomerIntelligence()` | CI refresh | DB writes, WhatsApp replies |
| C18/C19/C20 (Express webhooks) | — | — | — | **Entire routes** | Retire |
| C21 (Express AI Booking) | — | — | — | **Entire route** | Retire |
| C22 (useDashboardMetrics) | After PR 8a | No | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` | SQL filter | KPI formatting, realtime subscriptions |
| C23 (useTimeSavedMetrics) | No | No | Aggregate counts only | None | Stays unchanged |
| C24 (useDailyBriefing) | After PR 8a | No | SQL filter + workload classification + delay detection | SQL filter | Workload classification, delay detection, inventory alerts, briefing format |
| C25 (useRevenueIntelligence) | After PR 8b | No | Full derivation: `deriveCustomerIntelligence()`, `buildLatestCompletedByCustomer()`, `findLatestReminder()`, revenue calcs, insight generation | Direct CI function calls, segment bucketing logic, revenue estimation calls | Revenue forecasting (expected/confirmed/atRisk), reminder analytics, insight generation, message formatting |
| C26 (Customers Page) | After PR 8c | No | No lifecycle eligibility check | Nothing (add eligibility check as enhancement) | Customer CRUD, reminder send UI |
| C27 (Customer Row) | No | No | Local JS filter | None | Row computation |
| C28 (CI Sync) | No | No | Calls `deriveCustomerIntelligence()` | None — persistence layer stays | Persists pipeline output |
| C29 (CI Backfill) | No | No | Calls `refreshCustomerIntelligence()` | None — maintenance tool | One-time operations |
| C30 (Migration Script) | No | No | `next_service_date = lastServiceDate + 180d` | None — one-time | One-time operations |
| C31 (Webhook Edge) | No | No | Staff-only operations | None | Stays unchanged |

---

## B. Duplication Heatmap

| Rank | Duplication | Consumers | Architectural Impact | Migration Priority | Complexity |
|------|------------|-----------|---------------------|-------------------|------------|
| 1 | **"Reminder due" filter** (`next_service_date <= today AND reminder_sent_at IS NULL`) | C8, C9, C10, C11, C12, C22, C24 | **Critical**: 5 independent implementations of the same business rule | 1 (highest) | Low |
| 2 | **Segment classification** (ready_to_book / follow_up_needed / high_churn_risk) | C25 | **Critical**: Revenue Intelligence duplicates the entire state machine | 2 | Medium |
| 3 | **Revenue estimation** (per-customer expected value) | C13, C14, C25 | **High**: Three implementations with different fallback logic | 2 | Low |
| 4 | **CI refresh on lifecycle events** (`refreshCustomerIntelligence()` calls) | C2, C6, C15, C16, C17 | **High**: 5 call sites doing the same post-mutation refresh | 3 (PR 8c) | Medium |
| 5 | **"Due this month" filter** (`next_service_date BETWEEN monthStart AND monthEnd`) | C13, C14, C25 | **Medium**: Revenue Intelligence + Weekly Revenue Cron | 2 | Low |
| 6 | **Non-responder detection** | C13, C14, C25 | **Medium**: Can be replaced by `reminderState` | 2 | Low |
| 7 | **`next_service_date = serviceDate + 180d`** | C1, C2, C3, C30 | **Low**: Data mutation, not derivation | 3 (PR 8c) | Low |
| 8 | **Workload classification** (High/Medium/Low) | C24 | **Low**: Presentation logic, not lifecycle | 4 | Low |
| 9 | **`reminder_sent_at` column** as reminder source of truth | C5, C8, C9, C10, C26 | **Low**: Legacy proxy; pipeline ignores this column | 3 (PR 8c) | Medium |
| 10 | **Express + Edge duplicates** of crons and webhooks | C9, C10, C14, C18, C19, C20, C21 | **Low**: Redundant infrastructure, not logic | 3 | Low |

---

## C. End-State Architecture After PR 8

```
                    ┌─────────────────────────────────────┐
                    │        Data Store (Supabase)         │
                    │  service_cards, reminder_responses,  │
                    │  customers, customer_intelligence    │
                    └──────────┬──────────────────┬───────┘
                               │                  │
                    ┌──────────▼──────────┐       │
                    │  CI Sync Layer      │       │
                    │  (persistence)      │       │
                    │  refreshCustomer-   │       │
                    │  Intelligence()     │       │
                    └──────────┬──────────┘       │
                               │                  │
                    ┌──────────▼──────────────────▼───────┐
                    │  Canonical Derivation Layer          │
                    │                                      │
                    │  ┌─────────────────────────────┐     │
                    │  │ Customer Attention Pipeline │     │
                    │  │ evaluateCustomerAttention() │     │
                    │  │ evaluateCustomerAttention-  │     │
                    │  │   Batch()                   │     │
                    │  │ Owns: lifecycleState,       │     │
                    │  │   attentionState,           │     │
                    │  │   requiredAction,           │     │
                    │  │   reminderEligible,         │     │
                    │  │   reminderState,            │     │
                    │  │   daysOverdue, healthScore, │     │
                    │  │   estimatedRevenue,         │     │
                    │  │   dueThisMonth              │     │
                    │  └─────────────────────────────┘     │
                    │                                      │
                    │  ┌─────────────────────────────┐     │
                    │  │ Lifecycle Transition Engine  │     │
                    │  │ evaluateTransition()         │     │
                    │  │ evaluateTransitionBatch()    │     │
                    │  │ Owns: transitionType,        │     │
                    │  │   previousLifecycleState,    │     │
                    │  │   didAnchorChange,           │     │
                    │  │   changeDescription          │     │
                    │  └─────────────────────────────┘     │
                    └──────────────────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────────┐
            │                         │                             │
            ▼                         ▼                             ▼
   ┌────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
   │ Read Consumers  │    │ Write Consumers      │    │ Cron Consumers      │
   │ (UI)            │    │ (Event Producers)    │    │ (Background)        │
   ├────────────────┤    ├─────────────────────┤    ├─────────────────────┤
   │ Dashboard      │    │ useCreateJob()       │    │ Send Reminders      │
   │ (C22)          │    │ → engine (PR 8c)     │    │ → pipeline (PR 8c)  │
   │                │    │                      │    │                     │
   │ Daily Briefing │    │ useUpdateJobStatus() │    │ Daily Briefing     │
   │ (C24)          │    │ → engine (PR 8c)     │    │ → pipeline (PR 8a)  │
   │                │    │                      │    │                     │
   │ Revenue        │    │ useCreateReminder-   │    │ Weekly Revenue     │
   │ Intelligence   │    │ Response()          │    │ → pipeline (PR 8a)  │
   │ (C25)          │    │ → engine (PR 8c)     │    │                     │
   │                │    │                      │    │ Stock Alerts        │
   │ Customers      │    │ Webhook handlers     │    │ (unchanged)         │
   │ (C26)          │    │ → engine (PR 8c)     │    └─────────────────────┘
   └────────────────┘    └─────────────────────┘
```

### Ownership boundaries

| Business Concept | Canonical Owner | Consumers |
|-----------------|-----------------|-----------|
| Lifecycle state (scheduled/not_due/ready_to_book/follow_up_needed/high_churn_risk) | **Customer Attention Pipeline** | C22, C24, C25, C11, C12, C13, C14 |
| Attention state (attention_needed/no_attention_needed) | **Customer Attention Pipeline** | C22, C24 |
| Required action (send_reminder/follow_up/recover/none) | **Customer Attention Pipeline** | C24, C11, C12 |
| Reminder eligibility (should a reminder be sent?) | **Customer Attention Pipeline** (as `reminderEligible`) | C8, C22, C24, C11, C12 |
| Reminder state (not_sent/awaiting_response/responded/booked/ignored) | **Customer Attention Pipeline** | C13, C14, C25 |
| Health score | **Customer Attention Pipeline** | C25 |
| Estimated revenue | **Customer Attention Pipeline** | C13, C14, C25 |
| Days overdue | **Customer Attention Pipeline** | C25 |
| Due this month | **Customer Attention Pipeline** (after adding `dueThisMonth`) | C13, C14, C25 |
| Transition type (lifecycle_start/cycle_completion/etc.) | **Lifecycle Transition Engine** | C1, C2, C6, C15, C16, C17 |
| Did anchor change | **Lifecycle Transition Engine** | C1, C2 |
| Did reminder state change | **Lifecycle Transition Engine** | C6, C15, C16 |
| Revenue forecast (expected/confirmed/atRisk) | **Revenue Intelligence (consumer)** | C25 |
| Reminder analytics (sent/responded/booked/conversion) | **Revenue Intelligence (consumer)** | C25 |
| Business insights (overdue >30 days, etc.) | **Revenue Intelligence (consumer)** | C25 |
| Workload classification (High/Medium/Low) | **Daily Briefing (consumer)** | C24, C11, C12 |
| Delay detection | **Daily Briefing (consumer)** | C24, C11, C12 |
| Inventory risk | **Daily Briefing (consumer)** | C24, C11, C12 |
| Next service date computation (+180 days) | **Write path (data mutation)** | C1, C2, C3, C30 |
| Manual CI override | **useUpdateCustomerIntelligence (consumer)** | C7 |
| CI persistence | **customer-intelligence-sync.ts** | C28, C29 |

---

## 5. PR 8 Migration Status (Read-side Consumers)

### Migrated (via Canonical Customer Attention Pipeline)

| Consumer | File | Replaced Legacy Pattern | Notes |
|---|---|---|---|
| **Dashboard Metrics** (C22) | `src/lib/queries.ts:useDashboardMetrics()` | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` | Uses `evaluateCustomerAttentionBatch()` → `reminderEligible` count |
| **Daily Briefing Cron (Vercel)** (C11) | `api/cron/daily-briefing.ts` | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` | Uses pipeline; fetches all cards, filters today's jobs client-side |
| **Daily Briefing Cron (Express)** (C12) | `api/server.js:688` | SQL: `next_service_date <= today AND reminder_sent_at IS NULL` | Uses `pipeline-shim.js` (JS port of pipeline); response now includes `summary.reminders` |
| **Weekly Revenue Insight (Vercel)** (C13) | `api/cron/weekly-revenue-insight.ts` | SQL month filter + flat ₹1200 revenue | Uses pipeline's `estimatedRevenue` + `reminderState` |
| **Weekly Revenue Insight (Express)** (C14) | `api/server.js:785` | SQL month filter + flat ₹1200 revenue | Uses `pipeline-shim.js`; same logic as Vercel cron |
| **Revenue Intelligence** (C25) | `src/lib/queries.ts:useRevenueIntelligence()` | Direct `deriveCustomerIntelligence()` + `customerHasActiveJob()` calls | All segment bucketing, revenue estimation, and overdue detection from pipeline |

### Remaining (Write-side — deferred to PR 9)

All remaining consumers that independently derive lifecycle state are **write-side** workflows:

| Consumer | File | Legacy Pattern | Reason for Deferral |
|---|---|---|---|
| Send Reminders (Vercel Cron) (C8) | `api/cron/send-reminders.ts` | SQL filter + writes `reminder_sent_at` | Write-side: mutates DB |
| Send Reminders (Express) (C9) | `api/server.js:646` | SQL filter + writes `reminder_sent_at` | Write-side: mutates DB |
| Send Reminders (Edge Function) (C10) | `supabase/functions/send-reminders/index.ts` | SQL filter + writes `reminder_sent_at` | Write-side: mutates DB |
| CI Sync (C29) | `src/lib/customer-intelligence-sync.ts` | Direct `deriveCustomerIntelligence()` + `customerHasActiveJob()` | Write-side: persists to `customer_intelligence` table |
| Webhook — Vercel (C15, C16, C17) | `api/webhook/index.ts` | Calls `refreshCustomerIntelligence()` (→ C29) | Write-side: mutates DB |
| Webhook — Express (C18, C19, C20) | `api/server.js:535,543,609` | Inline write logic | Write-side: mutates DB |
| CI Backfill | `src/lib/customer-intelligence-backfill.ts` | Calls `refreshCustomerIntelligence()` (→ C29) | Write-side: backfill utility |

### Boundary

Every **read-side** consumer that answers "who needs attention?" now goes through the canonical pipeline. The only remaining legacy derivation exists in **write-side** workflows (job/reminder mutations that persist state). These will be migrated to use the Lifecycle Transition Engine in PR 9.

The Express server (`api/server.js`) consumes the pipeline directly via the TypeScript re-export wrapper (`api/lib/customer-attention-pipeline.ts`), using `tsx` for runtime TypeScript compilation (`npm start` now runs `tsx api/server.js`). There is exactly one implementation of lifecycle derivation. The send-reminders route at `api/server.js:646` remains as a write-side exception, deferred to PR 9.
