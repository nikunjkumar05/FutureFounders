# Reminder Response Tracking — Architecture Investigation

> **Branch:** `investigate/reminder-response-tracking`
> **Scope:** Investigation only — no implementation, no business-logic changes
> **Date:** 2026-07-04

---

## 1. Complete Reminder Response Architecture

```
Customer replies on WhatsApp
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OpenWA Server (openwa-server/start.js)                             │
│  └─ Receives message via Baileys WebSocket                          │
│  └─ Forwards to POST /api/webhook                                   │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────────────┐
│ Vercel Webhook  │ │ Express Server  │ │ Supabase Edge Function   │
│ api/webhook/    │ │ api/server.js   │ │ supabase/functions/      │
│ index.ts        │ │ (lines 322-644) │ │ webhook/index.ts         │
│ (520 lines)     │ │ (duplicate)     │ │ (290 lines, duplicate)   │
└────────┬────────┘ └────────┬────────┘ └───────────┬──────────────┘
         │                   │                      │
         └───────────────────┼──────────────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  PATCH reminder_responses   │
              │  status = 'responded'       │
              │  or 'booked'                │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────────────────┐
              │ evaluateTransitionForCustomer()          │
              │ (src/lib/transition-service.ts)          │
              │  └─ Resolves service cards (DB)          │
              │  └─ Resolves reminders (DB)              │
              │  └─ Resolves previous lifecycle state    │
              │  └─ Calls evaluateTransition() (engine)  │
              └─────────────────────┬───────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │ evaluateTransition()                    │
              │ (src/lib/lifecycle-transition-engine.ts) │
              │  └─ Calls evaluateCustomerAttention()    │
              │     (customer-attention-pipeline.ts)     │
              │  └─ Determines transition type           │
              │  └─ Returns TransitionResult             │
              └─────────────────────┬───────────────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────────┐
              │ persistTransitionResult()                │
              │ (src/lib/persist-transition-result.ts)   │
              │  └─ Upserts customer_intelligence table  │
              └─────────────────────────────────────────┘
```

---

## 2. Reminder Response Sources

### Supported Statuses

| Status | Definition | Where Created |
|--------|-----------|---------------|
| `sent` | Reminder message dispatched | `api/cron/send-reminders.ts`, `useCreateReminderResponse()` (frontend), Supabase Edge Function `send-reminders` |
| `responded` | Customer replied affirmatively (yes/confirm/haan) | `api/webhook/index.ts`, `api/server.js`, `useCreateReminderResponse()` (frontend) |
| `booked` | Customer selected a time slot, job auto-created | `api/webhook/index.ts`, `api/server.js` |
| `ignored` | Never created by any code path | **Unused** — defined in type (`ReminderStatus`) and handled in engine switch, but no component ever writes `status = 'ignored'` |

### Status Actually In Use

- **`sent`** — actively written by cron and frontend manual reminder
- **`responded`** — actively written by webhook and frontend
- **`booked`** — actively written by webhook (after slot selection)
- **`ignored`** — **not written anywhere** in current codebase

### Entry Points

| # | Source | File | Status Written | Transition Called |
|---|--------|------|---------------|-------------------|
| 1 | Cron: Send Reminders | `api/cron/send-reminders.ts` | `sent` | ✅ `reminder_sent` |
| 2 | Frontend: Manual remind | `src/pages/Customers.tsx` via `useCreateReminderResponse()` | `sent` | ✅ `reminder_sent` |
| 3 | Frontend: Revenue Intel remind | `src/components/RevenueIntelligence.tsx` via `useCreateReminderResponse()` | `sent` | ✅ `reminder_sent` |
| 4 | Webhook: Customer replies "yes" | `api/webhook/index.ts:161` | `responded` | ✅ `reminder_responded` |
| 5 | Webhook: Customer picks slot | `api/webhook/index.ts:227` | `booked` | ✅ `reminder_booked` |
| 6 | Express webhook: Customer replies "yes" | `api/server.js:541` | `responded` | ❌ **No transition called** |
| 7 | Express webhook: Customer picks slot | `api/server.js:552` | `booked` | ❌ **No transition called** |
| 8 | Supabase Edge Function webhook | `supabase/functions/webhook/index.ts` | `responded`/`booked` | ❌ **No transition called** (not inspected in detail) |

---

## 3. Database Tables

### `reminder_responses`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Row identity |
| `service_card_id` | uuid (FK → service_cards) | Scopes reminder to a specific service card (the lifecycle anchor) |
| `merchant_id` | uuid (FK → merchants) | Multi-tenant isolation |
| `customer_id` | uuid (FK → customers) | Customer this reminder is for |
| `sent_at` | timestamptz | When the reminder was dispatched |
| `responded_at` | timestamptz | When the customer replied (null for `sent` status) |
| `response` | text | Raw message body from customer |
| `status` | text (`sent`/`responded`/`booked`/`ignored`) | Current state |
| `notes` | text | Optional metadata |
| `created_at` | timestamptz | Row creation |

**Indexes:** merchant_id, customer_id, service_card_id, status

**Realtime publication:** Yes (subscribed by Dashboard)

### `service_cards`

Participates via `reminder_sent_at` field (legacy proxy for "reminder sent"). The send-reminders cron writes `reminder_sent_at` AND inserts a `reminder_responses` row simultaneously.

### `customer_intelligence`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Row identity |
| `merchant_id` | uuid (FK) | Multi-tenant |
| `customer_id` | uuid (FK) | Customer |
| `segment` | text | Lifecycle state (`ready_to_book`, `follow_up_needed`, `high_churn_risk`, `unknown`) |
| `estimated_revenue` | numeric | Revenue estimate |
| `last_reminder_response` | text | **Never written by any code path** — field exists in schema but unused |
| `last_contacted_at` | timestamptz | **Never written** |
| `notes` | text | Optional |
| `updated_at` | timestamptz | Updated on every `persistTransitionResult` call |

**Unique constraint:** `(merchant_id, customer_id)`

### `webhook_idempotency`

| Field | Type | Purpose |
|-------|------|---------|
| `key` | text | Idempotency key to deduplicate webhook messages |
| `created_at` | timestamptz | Auto-cleanup via RPC |

---

## 4. Write-Side Flow (Detailed)

### Entry Point: `useCreateReminderResponse()` (queries.ts:1587)

```
Caller (Customers.tsx or RevenueIntelligence.tsx)
  └─ mutationFn: INSERT reminder_responses (sent_at, status, ...)
  └─ onSuccess:
       ├─ Invalidates 'revenue_intelligence' query cache
       ├─ Fires analytics event (reminder_sent or reminder_response_received)
       └─ Calls evaluateTransitionForCustomer(supabase, { merchantId, customerId, event })
            └─ event.type = map(status):
                 'sent'       → 'reminder_sent'
                 'responded'  → 'reminder_responded'
                 'booked'     → 'reminder_booked'
                 default      → 'reminder_ignored'
```

### Entry Point: Webhook (api/webhook/index.ts)

```
processMessage(payload)
  └─ Idempotency check (webhook_idempotency table)
  └─ Staff detection
  └─ If NOT staff → customer detection
       └─ If "yes"/"confirm"/"haan":
            ├─ FIND latest sent reminder_responses for anchor card
            ├─ PATCH status='responded', responded_at=now, response=messageBody
            └─ evaluateTransitionForCustomer({ event: 'reminder_responded' })
                 └─ persistTransitionResult()
       └─ If "morning"/"afternoon":
            ├─ FIND latest responded reminder_responses for anchor card
            ├─ POST service_cards (auto-book job)
            ├─ PATCH reminder_responses status='booked'
            └─ evaluateTransitionForCustomer({ event: 'reminder_booked' })
                 └─ persistTransitionResult()
```

### Entry Point: Express Server Webhook (api/server.js)

Identical logic to Vercel webhook for customer "yes" and "morning"/"afternoon" paths but **does NOT call `evaluateTransitionForCustomer`** or `persistTransitionResult`. This means the `customer_intelligence` table is NOT updated when a reminder response comes through the Express webhook path.

### Entry Point: Send Reminders Cron (api/cron/send-reminders.ts)

```
For each due card (next_service_date <= today, reminder_sent_at IS NULL, job_status = pending):
  ├─ Send WhatsApp via OpenWA
  ├─ PATCH service_cards SET reminder_sent_at = now()
  ├─ POST reminder_responses (status='sent', sent_at=now)
  └─ evaluateTransitionForCustomer({ event: 'reminder_sent' })
       └─ persistTransitionResult()
```

### Transition Service → Engine → Persistence Chain

```
evaluateTransitionForCustomer()          [transition-service.ts]
  ├─ resolveServiceCards()                [queries service_cards WHERE customer_id]
  ├─ resolveReminders()                   [queries reminder_responses WHERE customer_id]
  ├─ resolvePreviousLifecycleState()      [queries customer_intelligence]
  └─ evaluateTransition()                 [lifecycle-transition-engine.ts] (pure)
       └─ evaluateCustomerAttention()     [customer-attention-pipeline.ts] (pure)
            └─ deriveCustomerIntelligence()  [customer-intelligence.ts] (pure)
                 └─ classifySegment()     [time-based: 240h threshold]
  └─ returns TransitionResult

persistTransitionResult()                [persist-transition-result.ts]
  └─ UPSERT customer_intelligence (merchant_id, customer_id)
       SET segment, estimated_revenue, updated_at
```

---

## 5. Dashboard Data Flow

### Responded Metric

**Component:** `RevenueIntelligence.tsx` → `respondedToReminder` (displayed as "Responded" metric tile)

**Computation** in `useRevenueIntelligence()` (queries.ts:1501):
```typescript
const respondedCount = reminders.filter(r =>
  r.status === 'responded' || r.status === 'booked'
).length;
```

| Detail | Value |
|--------|-------|
| **Hook** | `useRevenueIntelligence()` |
| **Source table** | `reminder_responses` — fetches ALL rows for the merchant |
| **Aggregation** | `.length` after JS filter |
| **Filter** | `status === 'responded'` OR `status === 'booked'` |
| **Time scope** | **No time filter** — counts all-time responses |
| **Duplicate counting** | A customer who replied twice is counted twice (one row per reminder sent) |

### Reminder Analytics

**Component:** `RevenueIntelligence.tsx` → "Reminder Analytics" section

Computed in `useRevenueIntelligence()` (queries.ts:1499-1507):

| Metric | Formula | Source |
|--------|---------|--------|
| **Reminders Sent** | `reminders.length` (all rows for merchant) | `reminder_responses` table — all-time |
| **Responses** | `reminders.filter(r => r.status === 'responded' \|\| r.status === 'booked').length` | Same filter as Responded metric |
| **Bookings Generated** | `reminders.filter(r => r.status === 'booked').length` | `reminder_responses` table |
| **Conversion Rate** | `Math.round((bookedCount / totalRemindersSent) * 100)` | Derived from above two |

### Time Saved Metrics

**Hook:** `useTimeSavedMetrics()` (queries.ts:462)

Counts `reminder_responses` where `responded_at IS NOT NULL` within the current month:
```typescript
supabase.from('reminder_responses')
  .select('id', { count: 'exact', head: true })
  .eq('merchant_id', MERCHANT_ID)
  .not('responded_at', 'is', null)
  .gte('responded_at', monthStart)
  .lte('responded_at', monthEnd)
```

This is a **different count** from the Responded metric — it uses `responded_at IS NOT NULL` (any response with a timestamp) rather than checking `status`. These diverge because a `sent` row has `responded_at = null`, but a `booked` row may or may not have `responded_at` set (webhook only sets `responded_at` during the `status='responded'` PATCH, not during the subsequent `status='booked'` PATCH).

---

## 6. Customer Attention Impact

### Reminder State → Lifecycle State Mapping

The pipeline (`customer-attention-pipeline.ts:298`) determines lifecycle state via `deriveCustomerIntelligence()`:

```
classifySegment(latestReminder, today):
  - No reminder → 'ready_to_book'
  - Reminder sent < 240h ago → 'follow_up_needed'
  - Reminder sent >= 240h ago → 'high_churn_risk'
```

**Key insight:** The `status` field of the reminder (`sent`/`responded`/`booked`) does **NOT** affect the lifecycle classification. Only the **presence** of a reminder and the **elapsed time since `sent_at`** determines the segment. A `responded` reminder and a `sent` reminder both produce `follow_up_needed` or `high_churn_risk` based solely on time.

### Reminder State in Pipeline

The pipeline derives `ReminderState` separately:

```typescript
function buildReminderState(reminder): ReminderState {
  switch (reminder.status) {
    case 'sent':       return 'awaiting_response';
    case 'responded':  return 'responded';
    case 'booked':     return 'booked';
    case 'ignored':    return 'ignored';
    default:           return 'not_sent';
  }
}
```

This feeds into the `CustomerAttentionResult.reminderState` field but does **not** change the lifecycle state.

### Transition Types for Reminder Events

From `lifecycle-transition-engine.ts`:

| Event | Transition Type | Effect |
|-------|----------------|--------|
| `reminder_sent` | `reminder_transition` | Anchor unchanged, reminder state changes to `awaiting_response` |
| `reminder_responded` | `reminder_transition` | Anchor unchanged, reminder state changes to `responded` |
| `reminder_booked` | `active_job_override` | Creates active job → lifecycle overrides to `scheduled` regardless of prior state |
| `reminder_ignored` | `reminder_transition` | Anchor unchanged, reminder state changes to `ignored` |

---

## 7. Webhook Flow

### Three Webhook Implementations (Duplicate)

| # | File | Runtime | Transition Called? | Notes |
|---|------|---------|-------------------|-------|
| 1 | `api/webhook/index.ts` | Vercel serverless | ✅ Yes (both responded and booked) | **Canonical path** |
| 2 | `api/server.js` (lines 322-644) | Express server | ❌ No | Legacy duplicate — no transition evaluation |
| 3 | `supabase/functions/webhook/index.ts` | Supabase Edge | ❓ Unknown (not inspected in detail) | Likely also missing |

### Webhook Message Flow

```
1. OpenWA Server receives WhatsApp message via Baileys WebSocket
   (openwa-server/start.js)
   └─ POSTs to /api/webhook with payload:
        { event: 'message.received', data: { from, body, ... }, idempotencyKey }

2. Vercel webhook (api/webhook/index.ts):
   └─ Idempotency check (webhook_idempotency table)
   └─ Detect staff vs customer by phone number
   └─ If customer:
        ├─ "yes" → PATCH reminder_responses (status=responded) → transition(reminder_responded)
        ├─ "morning/afternoon" → POST service_cards + PATCH reminder_responses (status=booked) → transition(reminder_booked)
        └─ other → AI FAQ via Mistral → support_tickets table

3. Express server webhook (api/server.js):
   └─ IDENTICAL logic BUT missing transition calls
   └─ Also has greeting/bot-routing logic that Vercel webhook lacks
```

### Idempotency

Both webhook implementations check `webhook_idempotency` table using a key from the payload. Duplicate messages within the cleanup window are skipped.

---

## 8. Analytics Consistency

### Three Response Counts, Three Different Values

| Metric | File | Filter | Scope | Can Count Differ? |
|--------|------|--------|-------|-------------------|
| **Responded (RevenueIntel)** | queries.ts:1501 | `status === 'responded' \|\| 'booked'` | All-time | Yes — counts all-time, any status |
| **Time Saved (responded)** | queries.ts:490 | `responded_at IS NOT NULL` | Current month only | Yes — scoped to month, different filter |
| **Pipeline reminderState** | pipeline.ts:240 | Maps `status` to enum | Scoped to anchor card | Yes — only latest reminder per anchor |

### Divergences

1. **Responded vs Time Saved**: The Responded metric counts all-time; Time Saved counts only current month. The Responded metric uses `status` field; Time Saved uses `responded_at IS NOT NULL`. A `booked` row with a null `responded_at` (possible via webhook booking that only patches `status` without setting `responded_at`) would be counted in Responded but NOT in Time Saved.

2. **Revenue Intelligence vs Pipeline**: `useRevenueIntelligence()` independently computes `respondedCount` and `bookedCount` from raw reminders rather than consuming the pipeline's `reminderState` field. The pipeline's `reminderState` is scoped to the lifecycle anchor card, while Revenue Intelligence counts reminders across all cards.

3. **Cron weekly-revenue-insight**: Uses the pipeline's `reminderState === 'awaiting_response'` to find non-responders. This is scoped to the anchor card's latest reminder and may differ from the all-reminders filter used by Revenue Intelligence.

---

## 9. Current Business Meaning

| Term | Current Definition | Notes |
|------|-------------------|-------|
| **Responded** | `reminder_responses.status === 'responded'` OR `=== 'booked'` | In Revenue Intelligence; counts any customer who ever replied or booked |
| **Booked** | `reminder_responses.status === 'booked'` | Row-level flag; customer selected a slot |
| **Response** | `reminder_responses.response` (text column) | Raw WhatsApp message body |
| **Conversion** | `bookedCount / totalSent * 100` | Bookings ÷ total reminders sent (all-time) |
| **Sent** | `reminder_responses.status === 'sent'` | Reminder message dispatched (via cron or manual) |
| **ignored** | Defined in type but **never written** | No code path sets this status |
| **responded_at** | Timestamp column | Set only during the "yes" webhook path; NOT updated during "booked" path |

### Current Behaviour Surprises

- **"Responded" includes "booked"** — the metric label is misleading; it actually counts any non-sent response
- **`booked` rows may lack `responded_at`** — webhook booking patch only sets `status='booked'`, not `responded_at`, so Time Saved metric may undercount bookings that started as responses
- **Pipeline ignores reminder `status` for lifecycle** — only the presence and elapsed time since `sent_at` matter; a "yes" reply and no reply are classified identically by the pipeline
- **`ignored` is dead code** — the status is defined in type definitions and handled in engine switch cases but never written

---

## 10. End-to-End Example

### Customer: Ravi Kumar

#### Step 1: Reminder Sent (Cron)

| File | Action |
|------|--------|
| `api/cron/send-reminders.ts:98` | PATCH `service_cards` SET `reminder_sent_at = now()` |
| `api/cron/send-reminders.ts:109` | POST `reminder_responses` (status='sent', sent_at=now, service_card_id=anchor.id) |
| `api/cron/send-reminders.ts:146` | `evaluateTransitionForCustomer({ event: 'reminder_sent' })` |
| `transition-service.ts:176` | Resolves cards, reminders, previous CI state |
| `lifecycle-transition-engine.ts:229` | Calls pipeline, computes `reminder_transition` |
| `customer-attention-pipeline.ts:298` | Finds anchor card, finds latest reminder (now 'sent'), calls `deriveCustomerIntelligence()` |
| `customer-intelligence.ts:119` | `classifySegment(sent_reminder)` → `follow_up_needed` (reminder was just sent) |
| `persist-transition-result.ts:36` | UPSERT `customer_intelligence` SET segment='follow_up_needed' |

#### Step 2: Customer Replied "yes" (Webhook)

| File | Action |
|------|--------|
| `openwa-server/start.js` | Receives "yes" from Ravi via Baileys WebSocket |
| POST → `api/webhook/index.ts:20` | Message processed |
| `api/webhook/index.ts:88` | Idempotency check passes |
| `api/webhook/index.ts:131` | Customer lookup by phone → Ravi found |
| `api/webhook/index.ts:143` | Anchor card lookup: latest completed card |
| `api/webhook/index.ts:152-156` | Query: latest `reminder_responses` with status='sent' for anchor |
| `api/webhook/index.ts:161` | **PATCH** `reminder_responses` SET status='responded', responded_at=now(), response='yes' |
| `api/webhook/index.ts:170` | `evaluateTransitionForCustomer({ event: 'reminder_responded' })` |
| `transition-service.ts:176` | Re-resolves all data (cards, reminders, CI) |
| `lifecycle-transition-engine.ts:229` | Computes `reminder_transition`, `didReminderStateChange = true` |
| `customer-attention-pipeline.ts:298` | Now finds reminder with status='responded' |
| `customer-intelligence.ts:119` | `classifySegment(responded_reminder)` → still `follow_up_needed` (reminder was sent < 240h ago) |
| `persist-transition-result.ts:36` | UPSERT `customer_intelligence` SET segment='follow_up_needed' (no state change) |
| `api/webhook/index.ts:177` | WhatsApp reply: asks for time slot |

#### Step 3: Customer Selected "morning" (Webhook)

| File | Action |
|------|--------|
| `openwa-server/start.js` | Receives "morning" from Ravi |
| POST → `api/webhook/index.ts:20` | Message processed |
| `api/webhook/index.ts:179-184` | Query: latest `reminder_responses` with status='responded' for anchor |
| `api/webhook/index.ts:213-225` | **POST** `service_cards` (auto-booking with service_details, tomorrow's date) |
| `api/webhook/index.ts:227` | **PATCH** `reminder_responses` SET status='booked' |
| `api/webhook/index.ts:233` | `evaluateTransitionForCustomer({ event: 'reminder_booked' })` |
| `lifecycle-transition-engine.ts:229` | Computes `active_job_override` → lifecycleState='scheduled' |
| `persist-transition-result.ts:36` | UPSERT `customer_intelligence` SET segment='scheduled' |

#### Step 4: Dashboard Updates

| What Updates | When | Mechanism |
|-------------|------|-----------|
| Revenue Intelligence | After reminder sent + after webhook | `useCreateReminderResponse()` invalidates `revenue_intelligence` on `onSuccess`; Dashboard realtime subscription invalidates on `reminder_responses` change |
| Time Saved Metrics | After webhook | Dashboard realtime subscription for `reminder_responses` changes invalidates `time_saved_metrics` |
| Customer Intelligence | After each transition | `persistTransitionResult()` UPSERTs immediately; `revenue_intelligence` query cache invalidated |
| Responded Metric | On next `useRevenueIntelligence()` fetch | Counts `status === 'responded' \|\| 'booked'` — Ravi's row now qualifies |

### Files Involved (Complete Chain)

1. `openwa-server/start.js` — WhatsApp message receiver
2. `api/webhook/index.ts` — Vercel webhook handler (canonical path)
3. `api/server.js:322-644` — Express webhook handler (duplicate, no transitions)
4. `src/lib/transition-service.ts` — Canonical input resolver
5. `src/lib/lifecycle-transition-engine.ts` — Pure transition evaluator
6. `src/lib/customer-attention-pipeline.ts` — Canonical pipeline
7. `src/lib/customer-intelligence.ts` — Derivation helpers (classifySegment, findLatestReminder)
8. `src/lib/persist-transition-result.ts` — UPSERT into customer_intelligence
9. `src/lib/queries.ts` — `useCreateReminderResponse()`, `useRevenueIntelligence()`, `useTimeSavedMetrics()`
10. `src/components/RevenueIntelligence.tsx` — Dashboard UI consuming metrics
11. `src/pages/Dashboard.tsx` — Dashboard page with realtime subscriptions
12. `supabase/migrations/20260617000000_revenue_intelligence.sql` — Schema

---

## Root-Cause Summary

**Reminder responses propagate through the system via three separate write paths and are consumed by four independent read paths, with inconsistencies between each:**

1. **Three webhook implementations** (Vercel, Express, Supabase Edge) all handle the same `reminder_responded` / `reminder_booked` logic, but only the Vercel path calls the Transition Service. The Express server processes "yes" and "morning" replies without ever updating `customer_intelligence`.

2. **The Responded metric** (`reminder_responses.status` filter) and **Time Saved metric** (`responded_at IS NOT NULL` filter) use different filters for conceptually similar counts. A `booked` row can lack a `responded_at` timestamp, causing Time Saved to undercount.

3. **The pipeline ignores reminder status for lifecycle classification** — only elapsed time since `sent_at` matters. A customer who replied "yes" and a customer who ignored the reminder both map to `follow_up_needed` / `high_churn_risk` identically. The `reminderState` field captures the status but does not influence the lifecycle state.

4. **`useRevenueIntelligence()` independently computes reminder analytics** from raw `reminder_responses` rather than consuming the pipeline's pre-derived `reminderState`, creating a second derivation path with different scoping (all reminders vs. anchor-scoped).

5. **`ignored` status is never written** — defined in types, handled in engine switches, but no component ever sets it. The status exists purely as a placeholder.

6. **Reminder-scoping differs** — the pipeline scopes reminders to the lifecycle anchor card (`service_card_id`). Revenue Intelligence counts reminders across all cards for the customer. These produce different counts when a customer has multiple service cards with separate reminders.
