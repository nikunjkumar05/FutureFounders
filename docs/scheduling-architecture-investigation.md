# AquaTrak — Scheduling & Reminder Architecture Investigation

**Date:** 2026-07-05
**Status:** Complete (Investigation Only)
**Previous Investigations:**
- [Employee Advance Deduction Investigation]
- [AMC Architectural Discovery](amc-architectural-discovery.md)
- [Service Card & Job Architecture Investigation]

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Scheduling Architecture](#2-current-scheduling-architecture)
3. [Scheduling Ownership Analysis](#3-scheduling-ownership-analysis)
4. [Complete Scheduling Lifecycle](#4-complete-scheduling-lifecycle)
5. [Reminder Architecture](#5-reminder-architecture)
6. [Temporal Evaluation Architecture](#6-temporal-evaluation-architecture)
7. [Scheduling Consumers](#7-scheduling-consumers)
8. [Scheduling Constraints](#8-scheduling-constraints)
9. [Extension Points](#9-extension-points)
10. [Components That Should Remain Untouched](#10-components-that-should-remain-untouched)
11. [Missing Scheduling Capabilities](#11-missing-scheduling-capabilities)
12. [Scheduling Integration Analysis](#12-scheduling-integration-analysis)
13. [Architectural Risks](#13-architectural-risks)
14. [Open Questions](#14-open-questions)
15. [Final Conclusions](#15-final-conclusions)

---

## 1. Executive Summary

AquaTrak's scheduling architecture is **implicit and distributed**. No single component owns "scheduling" as a domain concept. Instead, scheduling is the incidental result of three independent subsystems:

1. **Service Card CRUD** (`src/pages/Jobs.tsx` + `src/lib/queries.ts`): The merchant manually picks a `service_date`, and the system computes `next_service_date` = `service_date + 180 days` in three duplicated locations.

2. **Reminder Pipeline** (`src/lib/customer-attention-pipeline.ts` + `src/lib/customer-intelligence.ts`): A pure derivation layer that reads `next_service_date` from the database and determines lifecycle state (`not_due`, `ready_to_book`, `follow_up_needed`, `high_churn_risk`) based entirely on time comparisons.

3. **Temporal Execution Layer** (3 cron jobs + 1 webhook): Time-driven processes that react to scheduling dates — sending reminders, generating briefings, and computing revenue insights.

**Key finding:** `next_service_date` is redundantly stored in the database AND derived dynamically by the pipeline. The stored value acts as a scheduling intent marker, while the pipeline derives the customer's actual lifecycle state from it at read time. This dual approach creates a system where scheduling is never truly evaluated — it is merely recorded and then interpreted.

There is no:
- Recurrence engine (no configurable intervals, no repeat patterns)
- Visit generator (no automated creation of future service cards)
- Scheduling abstraction layer (no central `Schedule` entity or service)
- Temporal event bus (time-driven behaviors are scattered across 3 crons and 1 webhook, all independently fetching and filtering data)

---

## 2. Current Scheduling Architecture

### 2.1 Database Schema

The `service_cards` table is the sole scheduling data store (`supabase/migrations/20260606162111_aquatrak_schema.sql:84-99`):

| Column | Type | Scheduling Role |
|--------|------|-----------------|
| `service_date` | `date NOT NULL DEFAULT current_date` | The scheduled service date |
| `next_service_date` | `date` (nullable) | The expected next service date (180 days after service_date) |
| `reminder_sent_at` | `timestamptz` (nullable) | When the WhatsApp reminder was sent |
| `job_status` | `job_status ENUM` | `pending`, `in_progress`, `completed` |

Supporting table: `reminder_responses` (`supabase/migrations/20260617000000_revenue_intelligence.sql:6-18`):

| Column | Type | Scheduling Role |
|--------|------|-----------------|
| `sent_at` | `timestamptz` | When reminder was dispatched |
| `responded_at` | `timestamptz` (nullable) | When customer responded |
| `status` | `text` | `sent`, `responded`, `booked`, `ignored` |

### 2.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICE CARDS TABLE                          │
│  service_date | next_service_date | reminder_sent_at | status    │
└──────┬──────────────────────┬───────────────────────┬───────────┘
       │                      │                       │
       ▼                      ▼                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  CREATE PATH  │    │  DERIVATION PATH  │    │  TEMPORAL PATH   │
│  Jobs.tsx     │    │  Pipeline +      │    │  Crons + Webhook │
│  Webhook      │    │  Engine + CI     │    │                   │
│  (manual +    │    │  (reads next_    │    │  (time-driven     │
│   auto-book)  │    │   service_date)  │    │   reactions)      │
└──────────────┘    └──────────────────┘    └──────────────────┘
```

### 2.3 Data Flow Summary

**Write path:** `User picks date in UI` → `queries.ts computes next_service_date` → `INSERT/UPDATE service_cards` → `evaluateTransitionForCustomer()`

**Read path:** `Component requests data` → `queries.ts fetches all cards + reminders` → `evaluateCustomerAttentionBatch()` → `deriveCustomerIntelligence()` → `lifecycle state + reminders`

**Temporal path:** `Cron fires` → `SQL filter by next_service_date` or `pipeline evaluation with today's date` → `send WhatsApp` → `write reminder_sent_at` → `evaluateTransitionForCustomer()`

---

## 3. Scheduling Ownership Analysis

### 3.1 Who Creates `service_date`

| Location | File | Lines | Trigger |
|----------|------|-------|---------|
| CreateJobModal | `src/pages/Jobs.tsx:539` | `useState(new Date().toISOString().slice(0, 10))` | Merchant picks date from date input |
| EditJobModal | `src/pages/Jobs.tsx:1224` | `useState(card.service_date)` | Merchant edits existing date |
| Webhook auto-book | `api/webhook/index.ts:220` | `service_date: tomorrow` | Customer responds with time slot via WhatsApp |
| Webhook auto-book (Express) | `api/server.js:551` | `service_date: tomorrow` | Same logic, duplicate implementation |

**Owner:** The merchant (via UI) or the webhook (via auto-booking). No automated scheduling logic exists.

### 3.2 Who Computes `next_service_date`

| Location | File | Lines | Formula |
|----------|------|-------|---------|
| `useCreateJob` | `src/lib/queries.ts:137-139` | `serviceDate + 180 * 86400000` ms | Hardcoded 180 days |
| `useUpdateJobStatus` (on complete) | `src/lib/queries.ts:94-97` | `card.service_date + 180 * 86400000` ms | Hardcoded 180 days from original service_date |
| `useUpdateJob` | `src/lib/queries.ts:803-805` | `job.serviceDate + 180 * 86400000` ms | Hardcoded 180 days (possibly changed date) |

**Owner:** `src/lib/queries.ts` — three independent computations, all using the same hardcoded `180 * 86400000` constant. No canonical constant, no configuration source.

**Critical observation:** On job completion (`useUpdateJobStatus`), `next_service_date` is computed from the **original** `service_date`, not from the completion date. This means if a job scheduled for Jan 1 is completed on Jan 15, `next_service_date` is still July 1 (180 days from service_date), not July 15 (180 days from completion).

### 3.3 Who Sets `reminder_sent_at`

| Location | File | Lines | Trigger |
|----------|------|-------|---------|
| Cron (Vercel) | `api/cron/send-reminders.ts:105` | `reminder_sent_at: new Date().toISOString()` | Cron fires, card is due |
| Cron (Express) | `api/server.js:671` | Same | Same, duplicate |
| Frontend (manual) | `src/lib/queries.ts:451` | `useMarkReminderSent` mutation | Merchant clicks "Send Reminder" in UI |
| Frontend (manual) | `src/pages/Customers.tsx:220` | `markReminder.mutate(...)` | "Remind" button in customer list |

**Owner:** The cron job (primary automated sender) and the merchant (manual override).

### 3.4 Source of Truth

There is **no single source of truth** for scheduling. The database stores scheduling intent (`service_date`, `next_service_date`), while the canonical pipeline derives scheduling state (`lifecycleState`, `reminderEligible`) from those stored values at read time.

The stored `next_service_date` is used directly by the legacy cron filter (`api/cron/send-reminders.ts:48`) but is also consumed by the pipeline which may interpret it differently based on context (e.g., whether a newer active job exists).

---

## 4. Complete Scheduling Lifecycle

### 4.1 Lifecycle Flow

```
1. MERCHANT CREATES JOB
   │
   ├─ User picks service_date in CreateJobModal (Jobs.tsx:539)
   ├─ queries.ts computes next_service_date = service_date + 180d (queries.ts:137-139)
   ├─ INSERT into service_cards (queries.ts:153-157)
   ├─ INSERT job_services rows (queries.ts:167-184)
   ├─ evaluateTransitionForCustomer({ type: 'job_created' }) (queries.ts:204-208)
   │   └─ transition-service.ts fetches all cards + reminders + CI
   │   └─ lifecycle-transition-engine.ts evaluates lifecycle state
   │   └─ persist-transition-result.ts upserts into customer_intelligence
   └─ Query cache invalidated (queries.ts:191-192)
   │
   ▼
2. JOB IS PENDING
   │
   ├─ Dashboard displays pending count (Dashboard.tsx:97)
   ├─ DailyBriefing filters jobs by service_date === today (daily-briefing.ts:195)
   └─ Pipeline sees "hasActiveJob" → lifecycleState = 'scheduled'
   │
   ▼
3. TIME PASSES: service_date ARRIVES
   │
   ├─ If service_date == today:
   │   ├─ Dashboard highlights for today
   │   ├─ Daily briefing includes in today's jobs
   │   └─ Staff check-in via WhatsApp (webhook/index.ts:261-314)
   │
   ▼
4. STAFF MARKS "DONE" (or merchant changes status to "completed")
   │
   ├─ Webhook: PATCH job_status = "completed" (webhook/index.ts:343-347)
   │   └─ OR: useUpdateJobStatus with status = "completed" (queries.ts:83-106)
   ├─ queries.ts computes next_service_date = service_date + 180d (queries.ts:94-97)
   ├─ UPDATE service_cards SET job_status = "completed", next_service_date = ... (queries.ts:99-104)
   ├─ evaluateTransitionForCustomer({ type: 'job_completed' }) (queries.ts:113-118)
   ├─ Webhook sends UPI payment link (webhook/index.ts:361-364)
   └─ Query cache invalidated
   │
   ▼
5. CUSTOMER IS NOW IN LIFECYCLE STATE
   │
   ├─ Pipeline evaluates: anchor card = latest completed
   │   ├─ IF next_service_date > today → lifecycleState = 'not_due' (ci.ts:179)
   │   ├─ IF next_service_date <= today, no reminder → lifecycleState = 'ready_to_book' (ci.ts:202)
   │   ├─ IF reminder sent < 240h ago → lifecycleState = 'follow_up_needed' (ci.ts:127-134)
   │   └─ IF reminder sent >= 240h ago → lifecycleState = 'high_churn_risk' (ci.ts:130-131)
   │
   ▼
6. CRON SENDS REMINDER (when next_service_date <= today AND reminder_sent_at IS NULL)
   │
   ├─ send-reminders.ts: SQL filter (line 48)
   ├─ Sends WhatsApp message (line 89-95)
   ├─ PATCH reminder_sent_at = now() (line 98-106)
   ├─ POST reminder_responses { status: "sent" } (line 109-127)
   └─ evaluateTransitionForCustomer({ type: 'reminder_sent' }) (line 146-154)
   │
   ▼
7. CUSTOMER RESPONDS TO REMINDER VIA WHATSAPP
   │
   ├─ Customer says "yes" (webhook/index.ts:151)
   │   ├─ PATCH reminder_responses SET status='responded' (line 161-169)
   │   └─ evaluateTransitionForCustomer({ type: 'reminder_responded' }) (line 170-175)
   │   └─ Bot asks for time slot (line 177)
   │
   ├─ Customer picks "morning" or "afternoon" (webhook/index.ts:178)
   │   ├─ POST new service_cards with service_date = tomorrow (line 213-225)
   │   ├─ PATCH reminder_responses SET status='booked' (line 227-231)
   │   └─ evaluateTransitionForCustomer({ type: 'reminder_booked' }) (line 233-238)
   │   └─ Bot confirms booking (line 240)
   │
   ▼
8. CYCLE REPEATS (back to step 1 with new auto-booked card)
```

### 4.2 Key Observations

- **No time-of-day scheduling:** `service_date` is a date only (no time). Scheduling is daily granularity.
- **No completion date tracking:** There is no `completed_at` or `completion_date` field. Completion is inferred from `job_status === 'completed'` and the `service_date` of the completed card.
- **No multi-visit scheduling:** Each service card represents a single visit. There is no mechanism to create recurring visits automatically.
- **Pipeline and SQL filter diverge:** The legacy cron uses `next_service_date=lte.today AND reminder_sent_at=is.null` while the pipeline derives `reminderEligible` from the lifecycle state machine. These should produce the same result but use different logic paths.

---

## 5. Reminder Architecture

### 5.1 Reminder Creation

Reminders are created in two ways:

1. **Automated (Cron):** `api/cron/send-reminders.ts` fires on schedule, queries for due cards, sends WhatsApp, writes `reminder_sent_at` to `service_cards` and inserts a row into `reminder_responses`.

2. **Manual (Frontend):** Merchant clicks "Remind" in `Customers.tsx:220` or `RevenueIntelligence.tsx:67`, invoking `useMarkReminderSent` (queries.ts:451) to set `reminder_sent_at`.

### 5.2 Reminder Timing Determination

There are **two independent systems** for determining who gets a reminder:

| System | Logic | File:Line |
|--------|-------|-----------|
| **Legacy SQL filter (cron)** | `next_service_date <= today AND reminder_sent_at IS NULL AND job_status = 'pending'` | `api/cron/send-reminders.ts:48` |
| **Canonical pipeline** | `lifecycleState === 'ready_to_book'` which means: `next_service_date <= today`, no active job, no reminder exists for the lifecycle anchor | `customer-attention-pipeline.ts:343` + `customer-intelligence.ts:123-124` |

**Important divergence:** The legacy filter checks `job_status = 'pending'` on any card, while the pipeline checks the lifecycle anchor (latest completed card). These can disagree when a customer has multiple cards.

### 5.3 Reminder Lifecycle State Machine

```
                    ┌──────────────┐
                    │  NOT SENT    │  (no reminder_responses row)
                    └──────┬───────┘
                           │ Cron sends / Merchant clicks Remind
                           ▼
                    ┌──────────────┐
                    │  SENT        │  (reminder_responses.status = 'sent')
                    └──────┬───────┘
                           │ Customer replies "yes"/"confirm"
                           ▼
                    ┌──────────────┐
                    │  RESPONDED   │  (reminder_responses.status = 'responded')
                    └──────┬───────┘
                           │ Customer picks "morning"/"afternoon"
                           ▼
                    ┌──────────────┐
                    │  BOOKED      │  (reminder_responses.status = 'booked')
                    └──────────────┘
                          │   ┌──────────────┐
                          └──►│  IGNORED     │  (never written — type exists but no code path)
                              └──────────────┘
```

The status transitions (`sent` → `responded` → `booked`) are driven entirely by WhatsApp message flows. There is no automated expiration — the `ignored` status exists in the `CHECK` constraint and TypeScript type but is **never written by any code path**.

### 5.4 Reminder Lifecycle and the Pipeline

The canonical pipeline (`customer-intelligence.ts:119-135`) ignores the reminder response `status` entirely. Only `sent_at` time matters:

| Condition | `classifySegment` result | Lifecycle State |
|-----------|--------------------------|-----------------|
| No reminder exists | `ready_to_book` | `ready_to_book` |
| `sent_at` < 240 hours ago | `follow_up_needed` | `follow_up_needed` |
| `sent_at` >= 240 hours ago | `high_churn_risk` | `high_churn_risk` |

This means `responded` and `booked` reminders are treated identically to `sent` reminders by the pipeline. A customer who booked and completed their service could still show as `follow_up_needed` if <240 hours have passed since the reminder was sent — though in practice, the new completed card creates a new anchor, and `findLatestReminder` re-scopes to that new anchor.

### 5.5 Reminder Persistence

| What | Where | When |
|------|-------|------|
| `reminder_sent_at` | `service_cards` column | Set when reminder is dispatched |
| `sent_at` | `reminder_responses` row | Set when reminder is dispatched |
| `responded_at` | `reminder_responses` row | Set when customer responds |
| `response` | `reminder_responses` row | Customer's reply text |
| `status` | `reminder_responses` row | `sent` → `responded` → `booked` |
| `segment` | `customer_intelligence` row | Updated by `persistTransitionResult` after each event |

### 5.6 Reminder Consumers

| Consumer | What It Reads | Lines |
|----------|--------------|-------|
| Revenue Intelligence | `reminder_responses.status` for conversion analytics | `queries.ts:1499-1507` |
| Time Saved Metrics | `responded_at IS NOT NULL` count for current month | `queries.ts:477-478` |
| Dashboard | All reminders passed to `evaluateCustomerAttentionBatch` | `queries.ts:565-567` |
| Daily Briefing | All reminders passed to `evaluateCustomerAttentionBatch` | `queries.ts:1178-1181` |
| Weekly Revenue Insight | All reminders passed to `evaluateCustomerAttentionBatch` | `weekly-revenue-insight.ts:51-53` |

### 5.7 Key Remaining Issues

1. **`ignored` status is never written** — exists in schema and types but unreachable
2. **Express server.js is an outdated duplicate** — does not create `reminder_responses`, does not call transitions
3. **`RevenueIntelligence` independently computes reminder analytics** — does not consume pipeline's `reminderState`
4. **Reminder scoping differs** — pipeline scopes to anchor card via `findLatestReminder`, Revenue Intelligence counts all reminders

---

## 6. Temporal Evaluation Architecture

### 6.1 Temporal Event Entry Points

Time enters the system through two mechanisms:

#### 6.1.1 Cron Jobs (Time-Driven)

| Cron | Frequency | File | What It Evaluates |
|------|-----------|------|-------------------|
| `send-reminders` | Probably daily | `api/cron/send-reminders.ts` | `next_service_date <= today` AND `reminder_sent_at IS NULL` AND `job_status = 'pending'` |
| `daily-briefing` | Daily (morning) | `api/cron/daily-briefing.ts` | `service_date === today` for jobs; pipeline for reminders |
| `weekly-revenue-insight` | Weekly | `api/cron/weekly-revenue-insight.ts` | Pipeline results filtered by `nextServiceDate` in current month |
| `stock-alerts` | Probably daily | `api/cron/stock-alerts.ts` | Inventory thresholds (no time-based logic) |

#### 6.1.2 Webhook Events (Event-Driven with Temporal Effect)

| Webhook | File | Lines | Temporal Effect |
|---------|------|-------|-----------------|
| Customer "yes" | `api/webhook/index.ts:151-177` | Creates `responded_at` timestamp |
| Customer slot choice | `api/webhook/index.ts:178-241` | Creates new `service_cards` with `service_date = tomorrow` |
| Staff "done" | `api/webhook/index.ts:334-354` | Sets `job_status = "completed"`, triggers lifecycle transition |
| Staff check-in | `api/webhook/index.ts:261-314` | Geo-verifies staff at job site on `service_date = today` |

### 6.2 Temporal Evaluation in the Lifecycle Engine

The lifecycle engine (`lifecycle-transition-engine.ts`) has `'temporal_evaluation'` as a first-class event type (line 33):

```typescript
type LifecycleEventType = 'temporal_evaluation';
```

When this event is evaluated:
- Transition type is `'temporal'` (line 167-169)
- The engine re-evaluates lifecycle state based on current time
- State changes are described as `"Time-based transition: 'X' → 'Y'."`

**However, no code path actually dispatches a `temporal_evaluation` event.** The type exists in the engine but no cron, no webhook, and no frontend code ever calls `evaluateTransitionForCustomer` with `{ type: 'temporal_evaluation' }`. Temporal evaluation is implicit — components like the pipeline derive state with `today = new Date()` at call time, but they never trigger a temporal event.

### 6.3 Passive Temporal Evaluation

Most temporal evaluation is **passive** — consumers re-derive state by calling the pipeline with `today = new Date()`:

| Consumer | How It Evaluates Time | File:Line |
|----------|----------------------|-----------|
| Dashboard metrics | `today = new Date()`, `weekAgo = Date.now() - 7*86400000` | `queries.ts:525-526` |
| Daily Briefing | `today = new Date().toISOString().slice(0, 10)` | `daily-briefing.ts:139` |
| Revenue Intelligence | `today = new Date()`, `monthStart`, `monthEnd` | `queries.ts:1346-1349` |
| Customer Attention Pipeline | `today = todayArg ?? new Date()` | `pipeline.ts:309` |
| Lifecycle Engine | `today = todayArg ?? new Date()` | `engine.ts:240` |
| Send Reminders Cron | `today = new Date().toISOString().slice(0, 10)` | `send-reminders.ts:45` |

### 6.4 Overdue Detection

Overdue detection is layered:

1. **`calcDaysOverdue`** (`customer-intelligence.ts:63-73`): Pure function comparing `nextServiceDate` to `todayStr`. Returns 0 if `nextServiceDate >= todayStr`, otherwise `Math.floor((today - nextServiceDate) / 86400000)`.

2. **Pipeline integration** (`customer-intelligence.ts:199`): `daysOverdue` is computed within `deriveCustomerIntelligence` for the segment-based states.

3. **Revenue Intelligence** (`queries.ts:1435-1444`): Overdue customers (not in this month's due set, `nextServiceDate < todayStr`, not `scheduled`) are bucketed into ready-to-book/follow-up/churn-risk.

4. **UI display** (`RevenueIntelligence.tsx:349-353`): Shows `"{customer.daysOverdue}d overdue"` badge.

### 6.5 Temporal Characteristics

| Characteristic | Value | Location |
|---------------|-------|----------|
| Service interval | 180 days (hardcoded) | `queries.ts:95,138,805` |
| Reminder follow-up threshold | 240 hours (10 days) | `customer-intelligence.ts:130` |
| Health score decay | 1.5 points per day overdue, max -60 | `customer-intelligence.ts:94` |
| Dashboard metrics window | 7 days (completed jobs) | `queries.ts:526,544` |
| Daily granularity | Date only, no time-of-day | Schema `date NOT NULL` |
| Auto-booking offset | Tomorrow (`Date.now() + 86400000`) | `webhook/index.ts:189` |
| Cron rate limiting | 300ms between sends | `send-reminders.ts:189` |

---

## 7. Scheduling Consumers

### 7.1 Consumer Inventory

| # | Consumer | File | Role | Reads Scheduling | Writes Scheduling | Canonical Consumer? |
|---|----------|------|------|-----------------|------------------|-------------------|
| 1 | **Jobs.tsx** | `src/pages/Jobs.tsx` | Primary scheduling UI | `service_date`, `next_service_date` | `service_date`, `next_service_date` | No (CRUD owner) |
| 2 | **useCreateJob** | `src/lib/queries.ts:125-212` | Job creation mutation | — | `service_date`, `next_service_date` | No |
| 3 | **useUpdateJobStatus** | `src/lib/queries.ts:80-122` | Status change mutation | `service_date` (read for calc) | `next_service_date` (on complete) | No |
| 4 | **useUpdateJob** | `src/lib/queries.ts:789-863` | Job edit mutation | — | `service_date`, `next_service_date` | No |
| 5 | **Customer Attention Pipeline** | `customer-attention-pipeline.ts` | Canonical lifecycle derivation | `next_service_date`, `service_date`, `reminder.sent_at` | — | **Yes** |
| 6 | **Customer Intelligence** | `customer-intelligence.ts` | Pure derivation functions | `next_service_date`, `service_date`, `reminder.sent_at` | — | **Yes** |
| 7 | **Lifecycle Transition Engine** | `lifecycle-transition-engine.ts` | Pure lifecycle state machine | `service_date`, `next_service_date` (via pipeline) | — | **Yes** |
| 8 | **Transition Service** | `transition-service.ts` | Canonical input resolver | Fetches all cards + reminders | — | **Yes** |
| 9 | **Dashboard.tsx** | `src/pages/Dashboard.tsx` | Dashboard KPIs | `service_date` (indirect via queries) | — | No |
| 10 | **DailyBriefing.tsx** | `src/components/DailyBriefing.tsx` | Ops briefing UI | `nextServiceDate` (via pipeline) | — | No |
| 11 | **RevenueIntelligence.tsx** | `src/components/RevenueIntelligence.tsx` | Revenue analytics | `nextServiceDate`, `service_date` (via pipeline) | `reminder_sent_at` | Partial |
| 12 | **Customers.tsx** | `src/pages/Customers.tsx` | Customer list | `service_date`, `next_service_date` | `reminder_sent_at` | No |
| 13 | **Send Reminders Cron** | `api/cron/send-reminders.ts` | Automated reminder dispatch | `next_service_date`, `reminder_sent_at` | `reminder_sent_at` | Partial (legacy filter) |
| 14 | **Daily Briefing Cron** | `api/cron/daily-briefing.ts` | Merchant briefing | `service_date`, `next_service_date` (via pipeline) | — | No |
| 15 | **Weekly Revenue Insight** | `api/cron/weekly-revenue-insight.ts` | Revenue summary | `nextServiceDate` (via pipeline) | — | No |
| 16 | **Webhook (Vercel)** | `api/webhook/index.ts` | WhatsApp message handling | `service_date` (lookups) | `service_date` (auto-book), `responded_at`, `status` | No |
| 17 | **Webhook (Express)** | `api/server.js` | Duplicate handling | Same as Vercel | Same as Vercel | No (duplicate) |
| 18 | **Monthly Revenue** | `monthly-revenue.ts` | Revenue calculation | `service_date` (month filter) | — | No |
| 19 | **persist-transition-result** | `persist-transition-result.ts` | CI persistence | — (receives derived result) | — | No |

### 7.2 Critical Consumers

**The only truly canonical consumers are:**
- `customer-intelligence.ts` — pure derivation
- `customer-attention-pipeline.ts` — canonical pipeline
- `lifecycle-transition-engine.ts` — pure state machine
- `transition-service.ts` — input resolution

**Every other consumer** either duplicates scheduling logic (the `queries.ts` mutations, the legacy cron filter) or independently interprets scheduling data (Revenue Intelligence, the cron jobs, the UI components).

### 7.3 Scheduling Data Dependencies

```
next_service_date
  ├── customer-intelligence.ts (derives lifecycleState, daysOverdue, healthScore)
  │   └── customer-attention-pipeline.ts (derives attentionState, requiredAction, reminderEligible)
  │       ├── lifecyle-transition-engine.ts (determines transition type)
  │       ├── Dashboard.tsx (dueReminders count)
  │       ├── DailyBriefing.tsx (reminder entries)
  │       ├── RevenueIntelligence.tsx (due set, overdue customers)
  │       ├── weekly-revenue-insight.ts (due customers this month)
  │       └── send-reminders.ts (legacy SQL filter)
  └── Customers.tsx (display)
  └── Jobs.tsx (display)
```

---

## 8. Scheduling Constraints

### 8.1 Hardcoded 180-Day Service Interval

**Location:** `src/lib/queries.ts:95,138,805` — three independent copies of `180 * 86400000`
**Effect:** Every job creation, update, and completion sets `next_service_date` to exactly 180 days after `service_date`.
**Why it exists:** AquaTrak's business model assumes a fixed 6-month cleaning cycle for water tanks.
**Constraint:** Not configurable per customer, per service type, or per contract. Cannot represent different intervals for different service types.

### 8.2 Hardcoded 240-Hour (10-Day) Reminder Threshold

**Location:** `src/lib/customer-intelligence.ts:130`
**Effect:** A reminder "expires" after 240 hours (10 days). Before that, the customer is in `follow_up_needed`; after that, `high_churn_risk`.
**Why it exists:** Business assumption that if no response within 10 days, the customer is unlikely to book.
**Constraint:** Not configurable per customer or per service type. Single fixed threshold for all customers.

### 8.3 Tomorrow-Only Auto-Booking

**Location:** `api/webhook/index.ts:189`
**Effect:** Auto-booked jobs via WhatsApp are always scheduled for `tomorrow = new Date(Date.now() + 86400000)`.
**Why it exists:** WhatsApp flow is designed for immediate next-day booking.
**Constraint:** Cannot schedule auto-booked jobs for a different date. No calendar picker in WhatsApp flow.

### 8.4 Date-Only Granularity

**Location:** Schema `service_date date NOT NULL DEFAULT current_date` (migration line 90)
**Effect:** Scheduling is at daily granularity only. No time-of-day, no time slots, no duration.
**Why it exists:** Simplicity for a water tank cleaning service where jobs typically span a full day.
**Constraint:** Cannot represent half-day jobs, morning/afternoon slots (despite the WhatsApp flow asking for "morning" or "afternoon" — this is stored in notes only).

### 8.5 Single Lifecycle Anchor Per Customer

**Location:** `customer-intelligence.ts:252-264` — `buildLatestCompletedByCustomer`
**Effect:** The pipeline identifies exactly one "lifecycle anchor" card per customer — the latest completed service card. All lifecycle state derives from this anchor's `next_service_date`.
**Why it exists:** Business model assumes sequential, single-visit service cycles.
**Constraint:** Cannot represent multiple overlapping service schedules (e.g., monthly maintenance + quarterly deep clean for the same customer).

### 8.6 No Completion Date

**Effect:** The `service_cards` table has `service_date` but no `completion_date` or `completed_at`.
**Why it exists:** Not historically needed.
**Constraint:** Cannot measure service duration (time between start and completion). `next_service_date` on completion is computed from `service_date` (the planned date), not from the actual completion date.

### 8.7 Legacy Cron Filter vs. Pipeline Divergence

**Location:** `api/cron/send-reminders.ts:48` (SQL filter) vs. `customer-attention-pipeline.ts:343` (pipeline)
**Effect:** Two different eligibility determinations for reminders:
- SQL filter: `next_service_date <= today AND reminder_sent_at IS NULL AND job_status = 'pending'`
- Pipeline: `lifecycleState === 'ready_to_book'` (no active job, `next_service_date <= today`, no anchor reminder)
**Why it exists:** The cron was written before the canonical pipeline was established and has not been migrated.
**Constraint:** These can produce different results for customers with multiple cards or different job statuses.

### 8.8 Pipeline Anchors on Completed Cards Only

**Location:** `customer-attention-pipeline.ts:316-318`
**Effect:** The pipeline first looks for the latest completed card. If none exists, it falls back to the most recent card (any status).
**Why it exists:** Assumes the "normal" state is having completed previous service.
**Constraint:** A new customer (no completed cards) anchors on their first (pending) card — which lacks a `next_service_date` if the job was auto-booked via WhatsApp without computing one.

---

## 9. Extension Points

### 9.1 Classification Table

| Extension Point | File | Classification | Evidence |
|----------------|------|---------------|----------|
| `evaluateCustomerAttentionBatch` | `customer-attention-pipeline.ts:382-400` | **Reuse** | Pure function, accepts injected `today`, canonical derivation |
| `evaluateTransition` | `lifecycle-transition-engine.ts:226-348` | **Reuse** | Pure function, deterministic, `today` injection, `temporal_evaluation` event type exists |
| `evaluateTransitionForCustomer` | `transition-service.ts:176-209` | **Reuse** | Single entry point, accepts pre-fetched data via `TransitionServiceOptions` |
| `persistTransitionResult` | `persist-transition-result.ts:36-58` | **Reuse** | Simple upsert, can be called after any transition |
| `TransitionInput.serviceCards` | `lifecycle-transition-engine.ts:58-83` | **Extend** | Currently passes all cards; AMC cards would be additional cards in the same input |
| `service_cards.service_details` | Schema line 89 | **Extend** | JSONB field — AMC contract linkage can be added here |
| `job_status` ENUM | Schema line 92 | **Extend** | Could add `amc_visit` or similar status |
| `findLatestReminder` | `customer-intelligence.ts:228-240` | **Reuse** | Already scopes to anchor card ID — AMC reminders would follow same pattern |
| `classifySegment` | `customer-intelligence.ts:119-135` | **Wrap** | Currently pure time-based; could wrap AMC-specific segment logic |
| `deriveCustomerIntelligence` | `customer-intelligence.ts:158-217` | **Wrap** | Priority chain could include AMC contract state before `ready_to_book` |
| `send-reminders` cron | `api/cron/send-reminders.ts` | **Extend** | SQL filter could be parameterized; reminder logic could include contract state |
| Webhook auto-booking | `api/webhook/index.ts:178-241` | **Extend** | `service_details` JSONB build could include AMC contract reference |
| `useMarkReminderSent` | `queries.ts:445-460` | **Leave Untouched** | Legacy function, to be retired |
| `useCreateReminderResponse` | `queries.ts:1587-1642` | **Reuse** | Already handles all status types, calls transitions |

### 9.2 Key Extension Patterns

**Reuse:** Call `evaluateTransitionForCustomer` with AMC-relevant events. The engine and pipeline already handle arbitrary event types — AMC events like `amc_visit_completed` or `amc_renewal_detected` would fit the existing lifecycle model without changes to the core engine.

**Extend:** The `TransitionInput.serviceCards` array already contains all cards. AMC-generated cards would be included naturally. The `service_details` JSONB field on auto-booked cards already demonstrates an extension pattern — AMC contracts could add fields like `{ amc_contract_id, visit_number, is_amc_visit }`.

**Wrap:** `classifySegment` and `deriveCustomerIntelligence` could add AMC-aware branches before the current priority chain. The `customerHasActiveJob` check already demonstrates how a priority override works — AMC contract status could be another early-return condition.

---

## 10. Components That Should Remain Untouched

### 10.1 Lifecycle Transition Engine (`src/lib/lifecycle-transition-engine.ts`)

**Current responsibility:** Pure, side-effect-free state machine that determines lifecycle transitions given an event and current data. Handles 8 event types, produces 7 transition types.

**Why it should not change:** The engine is architecturally complete. It:
- Accepts arbitrary `LifecycleEventType` values (new types like `amc_visit_completed` don't require engine changes)
- Delegates state derivation to the pipeline (which is the extension point)
- Produces a `TransitionResult` that can carry any derived data
- Has `temporal_evaluation` as a first-class event type already defined

**Architectural ownership:** Pure state machine. AMC lifecycle transitions should be added via new event types passed to the engine, not by modifying the engine itself.

### 10.2 `customerHasActiveJob` (`src/lib/customer-intelligence.ts:16-23`)

**Current responsibility:** Define whether a customer has an active job (pending or in_progress). Used as the highest-priority override in `deriveCustomerIntelligence`.

**Why it should not change:** The definition of "active job" is stable. AMC visits would be represented as service cards with their own status — they would naturally be detected by this function.

### 10.3 `estimateServiceValue` (`src/lib/customer-intelligence.ts:28-58`)

**Current responsibility:** Estimate service revenue from `service_details` JSONB. Used by pipeline, transition engine, revenue intelligence.

**Why it should not change:** Already handles arbitrary JSONB structure with flexible fallbacks (totalCharge → services[] → capacity-based). AMC service values would be encoded in `service_details` and would be naturally parsed.

### 10.4 `findLatestReminder` (`src/lib/customer-intelligence.ts:228-240`)

**Current responsibility:** Find the latest reminder scoped to a given service card ID.

**Why it should not change:** The scoping-by-anchor-card pattern is correct. AMC-related reminders would be scoped to AMC visit cards and would be found by this same logic.

### 10.5 `buildLatestCompletedByCustomer` (`src/lib/customer-intelligence.ts:252-264`)

**Current responsibility:** Build a map of customer → latest completed card. Used as the lifecycle anchor.

**Why it should not change:** The definition of "latest completed" is stable. AMC visit cards that are completed would naturally become lifecycle anchors, pushing the service cycle forward.

### 10.6 `persist-transition-result.ts`

**Current responsibility:** Upsert transition results into `customer_intelligence` table.

**Why it should not change:** It is a simple persistence bridge with no business logic. AMC transitions would call the same function.

### 10.7 `monthly-revenue.ts`

**Current responsibility:** Calculate monthly revenue from completed service cards.

**Why it should not change:** Pure function that filters by `service_date` and `job_status === 'completed'`. AMC visit completions would be detected naturally.

---

## 11. Missing Scheduling Capabilities

### 11.1 Configurable Recurrence Interval

The 180-day interval is hardcoded in three places. There is no:
- Per-customer interval configuration
- Per-service-type interval configuration
- Per-contract interval configuration
- Database-stored interval value
- Way to express non-standard intervals

**Evidence:** `src/lib/queries.ts:95,138,805` — triple-duplicated `180 * 86400000` constant.

### 11.2 Visit Generation

There is no mechanism to automatically create future service cards. The system:
- Sets `next_service_date` on existing cards
- Never creates a new card for that future date
- Relies on the merchant to manually create each job

The only automatic card creation is via WhatsApp auto-booking (`webhook/index.ts:213-225`), which creates a single card for `tomorrow`.

**Evidence:** No cron or process iterates over `next_service_date` values and creates new `service_cards` rows.

### 11.3 Scheduling Abstraction Layer

There is no central `Schedule`, `Appointment`, or `Visit` entity. Scheduling is a byproduct of:
- `service_date` on `service_cards` (a date, not a time)
- `next_service_date` (a computed intent marker, not a scheduled event)
- Reminder timing (derived, not explicitly scheduled)

There is no:
- Schedule service or manager
- Scheduling API that components call
- Centralized time evaluation service

### 11.4 Multiple Recurrence Intervals

Cannot represent multiple simultaneous service schedules for the same customer (e.g., monthly tank cleaning + quarterly deep clean). The single `next_service_date` column and single lifecycle anchor per customer assume sequential single-track service.

**Evidence:** `buildLatestCompletedByCustomer` (`customer-intelligence.ts:252-264`) produces exactly one anchor per customer.

### 11.5 Contract-Based Scheduling

No entity or data model for recurring service contracts. AMC contracts would require:
- Contract entity (start date, end date, frequency, services included)
- Contract-to-visit linkage
- Contract-aware lifecycle state
- Contract renewal detection

### 11.6 Time-of-Day Scheduling

`service_date` is a `date` (no time component). Despite the WhatsApp flow asking for "morning" or "afternoon" slots, this information is stored only in `notes` (`webhook/index.ts:222`). There is no structured time slot, no duration, no calendar.

**Evidence:** Schema line 90: `service_date date`.

### 11.7 Completion Date Tracking

No `completed_at` or `completion_date` column. Service duration cannot be measured. `next_service_date` on completion uses the original `service_date`, not the actual completion date.

**Evidence:** `useUpdateJobStatus` at `queries.ts:94-97` computes `nextDate` from `card.service_date`, not from `new Date()`.

### 11.8 Reminder Expiration Handling

The `ignored` status in `reminder_responses` is never written. No cron or process marks old reminders as expired or ignored. The pipeline silently transitions through `follow_up_needed` after 240 hours, but the `reminder_responses` table retains stale `sent` status indefinitely.

**Evidence:** Type `ReminderStatus` includes `'ignored'` at `types.ts:320` but no code path sets it. `classifySegment` at `customer-intelligence.ts:119-135` ignores status entirely.

### 11.9 Temporal Event Dispatch

The `temporal_evaluation` event type exists in the lifecycle engine (`lifecycle-transition-engine.ts:33`) but no code path dispatches it. There is no cron that performs periodic lifecycle re-evaluation for all customers.

**Evidence:** No call to `evaluateTransitionForCustomer` with `{ type: 'temporal_evaluation' }` exists anywhere.

### 11.10 Scheduling Audit Trail

No history of scheduling changes. When `service_date` or `next_service_date` are updated, the old values are lost.

---

## 12. Scheduling Integration Analysis

### 12.1 Where Future Recurring Features (AMC) Would Naturally Integrate

#### 12.1.1 Contracts Table (New, External to Existing System)

A new `amc_contracts` table would live alongside `service_cards`, not within it. It would own:
- Contract period (start, end, next renewal)
- Service frequency (monthly, quarterly, custom interval in days)
- Included services and pricing
- Contract status (active, paused, cancelled, expired)

**Rationale:** The existing `service_cards` schema has no room for contract metadata. Adding contract fields to `service_cards` would violate single responsibility — a card represents one visit, not a contract.

#### 12.1.2 Visit Generation (New Cron or Extension of Existing)

A new cron (or extended `send-reminders` cron) would:
1. Read `amc_contracts` for active contracts
2. Determine if a visit is due based on contract frequency and last visit date
3. Create `service_cards` rows with `service_details` including `{ amc_contract_id, visit_number, is_amc_visit: true }`
4. Trigger lifecycle transitions with event type `amc_visit_generated` (or reuse `job_created`)

#### 12.1.3 Lifecycle State Machine (Reused, Not Changed)

The existing lifecycle state machine handles AMC visits naturally:
- AMC visit card created → pipeline sees `hasActiveJob: true` → lifecycleState = `'scheduled'`
- AMC visit completed → lifecycleState = `'not_due'` or `'ready_to_book'` depending on next visit timing
- No engine changes required

#### 12.1.4 Reminder Pipeline (Extended via Wrapper)

The pipeline's `deriveCustomerIntelligence` is the natural extension point for AMC awareness:
- Before checking `next_service_date > todayStr` for `not_due`, check if customer has an active AMC contract
- If AMC is active and next visit is due, return `ready_to_book` (or a new state like `amc_visit_due`)
- If AMC is active but next visit is not yet due, return `not_due`

#### 12.1.5 Reminder Sending (Reused)

The `send-reminders` cron would naturally find AMC-generated cards via the same legacy filter (`next_service_date <= today AND reminder_sent_at IS NULL AND job_status = 'pending'`). No change to the cron filter needed.

#### 12.1.6 Revenue Intelligence (Reused)

AMC visit cards would contribute to monthly revenue totals via the existing `calculateMonthlyRevenue` function. AMC contract value (fixed monthly recurring revenue) would be new, but per-visit revenue is already handled.

#### 12.1.7 Dashboard and Briefing (Reused)

AMC visits would appear in:
- Today's jobs (via `service_date === today` filter)
- Revenue metrics (via existing pipeline)
- Reminder counts (via existing pipeline)
- Staff assignment (via existing `technician_id` field)

### 12.2 Existing Scheduling Responsibilities That Should Remain Unchanged

| Responsibility | Owner | Why Unchanged |
|---------------|-------|---------------|
| Service date management | `Jobs.tsx` + `queries.ts` | Manual scheduling is distinct from automated visit generation |
| Lifecycle state derivation | `customer-intelligence.ts` | Pure function, AMC-aware via wrapper |
| Lifecycle transition evaluation | `lifecycle-transition-engine.ts` | Event-driven, accepts new event types |
| Lifecycle input resolution | `transition-service.ts` | Fetches all cards + reminders — AMC cards included |
| Reminder sending | `api/cron/send-reminders.ts` | SQL filter finds any due card, including AMC-originated |
| Monthly revenue | `monthly-revenue.ts` | Already aggregates all completed cards |
| Daily briefing | `api/cron/daily-briefing.ts` | Already uses canonical pipeline |

### 12.3 Existing Workflows That Appear Reusable

| Workflow | Reusable As-Is | Notes |
|----------|---------------|-------|
| Service card creation | Yes | AMC visit generation would create cards via same INSERT |
| Job status transitions | Yes | AMC visits move through same `pending → completed` flow |
| Reminder sending | Yes | Cron filter matches any due card |
| Reminder response handling | Yes | WhatsApp flow works for any reminder |
| Lifecycle transition evaluation | Yes | New event types are accepted by the engine |
| Customer intelligence persistence | Yes | `persistTransitionResult` is generic |
| Dashboard metrics | Yes | AMC cards counted alongside regular cards |
| Revenue calculation | Yes | AMC visit revenue in `service_details.JSONB` |

### 12.4 Architectural Boundaries to Respect

| Boundary | Rationale |
|----------|-----------|
| Service Card is the unit of work | AMC visits are service cards. Contract configuration is separate |
| Pipeline is the lifecycle oracle | AMC lifecycle state is derived by extending `deriveCustomerIntelligence`, not by replacing it |
| Transition engine is pure | AMC logic is in event dispatch and pipeline derivation, not in the engine |
| Transition service resolves inputs | AMC data is fetched alongside existing data (cards, reminders, CI) |
| Crons are temporal entry points | AMC visit generation is a new temporal process, not injected into existing crons |
| `service_details` JSONB is the data bridge | AMC contract linkage lives here, not in new columns on `service_cards` |

---

## 13. Architectural Risks

### 13.1 Triple-Duplicated Interval Constant

**Risk:** The 180-day interval is duplicated in three mutation functions (`queries.ts:95,138,805`). If one location is updated and the others are not, inconsistent scheduling occurs.

**Severity:** Medium. Currently all three use the same value, but there is no mechanism to ensure they stay in sync.

### 13.2 Legacy Cron Filter vs. Canonical Pipeline Divergence

**Risk:** The `send-reminders` cron uses a SQL filter that differs from the pipeline's lifecycle derivation. Changes to the pipeline that refine reminder eligibility will not automatically update the cron.

**Severity:** High. If the pipeline adds AMC-aware logic (e.g., "don't send reminders for customers with active AMC contracts"), the cron would still send them unless explicitly updated.

### 13.3 No Temporal Event Dispatch

**Risk:** The `temporal_evaluation` event type exists but is never dispatched. Lifecycle state is only re-evaluated reactively (when a mutation or cron calls the pipeline). State can become stale if time passes without any reactive event.

**Severity:** Low for current usage (pipeline re-evaluation happens on every read). But without explicit temporal events, transition history does not record when time-induced state changes occurred.

### 13.4 Completion Uses `service_date` Not Actual Date

**Risk:** `next_service_date` on completion is `service_date + 180 days` — computed from the planned service date, not the actual completion date. If a job is completed late, the next service date is still 180 days from the original plan, effectively compressing or expanding the cycle.

**Severity:** Low for current usage (dates are approximate). But the next service calculation effectively ignores actual service timing.

### 13.5 No `completed_at` Column

**Risk:** Without a completion timestamp, it is impossible to measure:
- Service duration
- Time between completion and next service
- Staff productivity (jobs per day)
- Whether `next_service_date` on completion should be from the actual completion date

**Severity:** Medium. Limits analytics and prevents accurate scheduling metrics.

### 13.6 Express server.js is an Outdated Duplicate

**Risk:** The Express server has partial duplicates of the cron and webhook logic that do not create `reminder_responses` rows and do not call lifecycle transitions. Depending on which server handles requests, state can become inconsistent.

**Severity:** Medium. Transition results may not be persisted when events flow through the Express path.

### 13.7 Pipeline Ignores Reminder Response Status for Lifecycle

**Risk:** The `classifySegment` function only considers `sent_at` time, not the `status` field. A customer who responded and booked still shows `follow_up_needed` or `high_churn_risk` until the anchor changes. This is partially mitigated by anchor re-scoping, but the design makes the `status` field semantically weak.

**Severity:** Low. In practice, a `booked` reminder creates a new card, which becomes the new anchor, which resets the reminder state.

### 13.8 Auto-Booked Cards Lack `next_service_date`

**Risk:** When the webhook creates a card via WhatsApp booking (`webhook/index.ts:213-225`), it does NOT compute `next_service_date`. The card has `next_service_date: null`. This means the pipeline cannot determine when the next service is due for auto-booked customers.

**Severity:** High. Auto-booked customers fall through to the `ready_to_book` state if their anchor card (previous completed) has no valid `next_service_date`, or they may not show up in "due this month" at all.

---

## 14. Open Questions

### 14.1 Scheduling Questions

| # | Question | Context |
|---|----------|---------|
| Q1 | Should `next_service_date` continue to be stored on `service_cards`, or should it be derived entirely at read time? | Currently both stored AND derived. Dual ownership creates inconsistency risk. |
| Q2 | Should the service interval be configurable per customer or per service type? | Currently 180 days for everything. AMC contracts need custom frequencies. |
| Q3 | Should `next_service_date` on completion use the original `service_date` or the actual completion date? | Currently uses `service_date`. Using completion date would be more accurate. |
| Q4 | Should auto-booked WhatsApp cards receive a computed `next_service_date`? | Currently null. This seems like an oversight — they should get the same 180-day calculation. |
| Q5 | Should `next_service_date` be promoted from a stored column to a computed/derived field? | Would eliminate the triple-duplicated computation and make it canonical. |

### 14.2 Reminder Questions

| # | Question | Context |
|---|----------|---------|
| Q6 | Should the legacy SQL filter in `send-reminders.ts` be replaced with pipeline-based eligibility? | Currently two parallel systems. Migration would eliminate divergence. |
| Q7 | Should `ignored` reminder status be written automatically after 10+ days without response? | Currently never written. Would make reminder state machine semantically complete. |
| Q8 | Should the 240-hour threshold be configurable? | Currently hardcoded. AMC contracts may need different follow-up windows. |

### 14.3 Temporal Questions

| # | Question | Context |
|---|----------|---------|
| Q9 | Should a periodic cron dispatch `temporal_evaluation` events for all customers? | Currently no temporal events are dispatched. State re-evaluation is passive. |
| Q10 | Should `completed_at` be added to `service_cards` for accurate service timing? | Currently no completion timestamp exists. Needed for scheduling metrics and accurate interval calculation. |

### 14.4 Architecture Questions

| # | Question | Context |
|---|----------|---------|
| Q11 | Should the `send-reminders` cron be migrated from SQL filter to pipeline-based evaluation? | Would make it a canonical pipeline consumer and eliminate the legacy path. |
| Q12 | Should Revenue Intelligence consume `reminderState` from the pipeline rather than computing its own? | Currently computes independent analytics from raw reminders. Pipeline already provides `reminderState`. |
| Q13 | Should Express server.js be deprecated in favor of the Vercel implementations? | Express duplicates are missing reminder_responses creation and transition calls. |
| Q14 | Is the current "lifecycle anchor on latest completed card" model correct for AMC, or should AMC have its own anchor? | AMC visits may need to anchor to the contract rather than to the latest completed card. |

---

## 15. Final Conclusions

### 15.1 Who Owns Scheduling?

**No single component owns scheduling.** It is distributed across:

- **`src/lib/queries.ts`** — writes `service_date` and `next_service_date` (three duplicated mutation functions)
- **`src/lib/customer-intelligence.ts`** — derives lifecycle state from stored scheduling dates (read-only)
- **`src/lib/customer-attention-pipeline.ts`** — canonical derivation pipeline (read-only)
- **`src/lib/lifecycle-transition-engine.ts`** — state machine that reacts to scheduling events (pure function)
- **`api/cron/send-reminders.ts`** — temporal actor that reads scheduling dates and sends reminders

Scheduling is an **emergent property** of the interaction between these components, not a domain concept with an owner.

### 15.2 What Does `next_service_date` Represent?

**`next_service_date` is a scheduling intent marker, not a firm appointment.** It represents:

- The expected date of the next service, computed as `last_service_date + 180 days`
- A filter criterion for reminder eligibility (`next_service_date <= today` means the customer is due)
- A display value for the merchant ("Next service due: 15 Jan 2026")

It is NOT:
- A guaranteed appointment (no card is created for this date)
- A binding commitment (it can be freely edited)
- A trigger (no process fires when this date arrives)

The pipeline derives the customer's actual lifecycle state from this value at read time — if the date has passed and no reminder was sent, the customer is `ready_to_book`.

### 15.3 How Are Reminder Timings Determined?

**Two parallel systems:**

1. **Legacy (SQL filter):** `next_service_date <= today AND reminder_sent_at IS NULL AND job_status = 'pending'` — used by the cron to find cards that need reminders.

2. **Canonical (Pipeline):** `lifecycleState === 'ready_to_book'` — derived from the anchor card's `next_service_date` and the presence/absence of a reminder. Only customers in the `ready_to_book` state are eligible for reminders.

After sending, timing is determined by elapsed hours since `sent_at`:
- < 240 hours: `follow_up_needed`
- >= 240 hours: `high_churn_risk`

### 15.4 How Do Temporal Events Enter the System?

**Exclusively through cron jobs.** The three time-driven crons (`send-reminders`, `daily-briefing`, `weekly-revenue-insight`) are the only components that independently evaluate the current time and react to it. All other temporal evaluation is **passive** — it happens when a consumer happens to call the pipeline with `today = new Date()`.

There is no temporal event bus, no scheduled task queue, and no periodic lifecycle re-evaluation cron.

### 15.5 Which Systems React to Scheduling Changes?

**Immediate reactors (via `evaluateTransitionForCustomer`):**
- `useCreateJob` — dispatches `job_created`
- `useUpdateJobStatus` — dispatches `job_completed`
- `useCreateReminderResponse` — dispatches reminder events
- `send-reminders` cron — dispatches `reminder_sent`
- Webhook — dispatches `reminder_responded`, `reminder_booked`, `job_completed`

**Passive consumers (re-evaluate on read):**
- Dashboard — re-queries with `today` on mount/interval
- Daily Briefing — evaluates with `today` on every briefing
- Revenue Intelligence — re-evaluates with `today` on every interaction
- Customer list — re-evaluates with `today` on every render

### 15.6 Which Components Are Canonical?

| Component | Canonical? | Notes |
|-----------|-----------|-------|
| `customer-intelligence.ts` | **Yes** | Pure derivation functions |
| `customer-attention-pipeline.ts` | **Yes** | Canonical derivation pipeline |
| `lifecycle-transition-engine.ts` | **Yes** | Pure state machine |
| `transition-service.ts` | **Yes** | Canonical input resolver |
| `persist-transition-result.ts` | **Yes** | Canonical persistence bridge |
| `queries.ts` mutations | **No** | Duplicated interval logic, not canonical |
| `send-reminders.ts` SQL filter | **No** | Legacy, diverges from pipeline |
| `server.js` | **No** | Outdated duplicate |
| `RevenueIntelligence.tsx` analytics | **No** | Independent computation duplicates pipeline |

### 15.7 Which Scheduling Assumptions Must Future Recurring Features (AMC) Respect?

**Non-negotiable constraints:**
1. **Service Card is the atomic unit of work.** AMC visits are service cards with contract linkage in `service_details` JSONB.
2. **The pipeline is the lifecycle oracle.** AMC lifecycle state must be derived by extending `deriveCustomerIntelligence`, not by replacing it.
3. **The transition engine is pure and event-driven.** AMC events dispatch through the existing `evaluateTransitionForCustomer` path.
4. **`next_service_date` is a scheduling intent marker, not an appointment.** AMC visit generation is a new process, not a trigger on `next_service_date`.
5. **Scheduling is daily granularity.** AMC visits follow the same date-only model.

**Negotiable but currently hardcoded:**
1. **180-day service interval** — needs to become configurable per contract.
2. **240-hour reminder threshold** — needs to become configurable per contract.
3. **Single lifecycle anchor per customer** — AMC may need its own anchor independent of regular service.
4. **No completion date** — AMC may benefit from `completed_at` for accurate interval calculation.

---

## Appendix A: File Reference

| File | Lines | Role |
|------|-------|------|
| `src/lib/queries.ts` | 1702 | All React Query hooks (scheduling mutations + read queries) |
| `src/lib/customer-intelligence.ts` | 303 | Pure derivation: `classifySegment`, `deriveCustomerIntelligence`, `calcDaysOverdue`, etc. |
| `src/lib/customer-attention-pipeline.ts` | 400 | Canonical pipeline: `evaluateCustomerAttention`, `evaluateCustomerAttentionBatch` |
| `src/lib/lifecycle-transition-engine.ts` | 378 | Pure state machine: `evaluateTransition`, event/transition types |
| `src/lib/transition-service.ts` | 253 | Input resolver: `evaluateTransitionForCustomer`, data fetching |
| `src/lib/persist-transition-result.ts` | 69 | Persistence: upserts `TransitionResult` into `customer_intelligence` |
| `src/lib/types.ts` | 483 | TypeScript interfaces: `ServiceCard`, `ReminderResponse`, `CustomerSegment`, etc. |
| `src/lib/monthly-revenue.ts` | 34 | Revenue aggregation: `calculateMonthlyRevenue` |
| `src/lib/timeUtils.ts` | 49 | Date range utilities using date-fns |
| `src/lib/timeSaved.ts` | 38 | Time-saved metric weights and formatting |
| `src/pages/Jobs.tsx` | ~1300 | Job scheduling Kanban: create, edit, status change |
| `src/pages/Dashboard.tsx` | 339 | Dashboard KPIs |
| `src/pages/Customers.tsx` | ~600 | Customer list with service history |
| `src/components/DailyBriefing.tsx` | 286 | Daily ops briefing UI |
| `src/components/RevenueIntelligence.tsx` | 500 | Revenue analytics dashboard |
| `api/cron/send-reminders.ts` | 217 | Reminder dispatch cron |
| `api/cron/daily-briefing.ts` | 268 | Daily ops briefing cron |
| `api/cron/weekly-revenue-insight.ts` | 165 | Weekly revenue summary cron |
| `api/cron/stock-alerts.ts` | 128 | Inventory threshold alerts cron |
| `api/webhook/index.ts` | 520 | WhatsApp webhook handler (Vercel) |
| `api/server.js` | ~850 | Express server (duplicate cron + webhook) |
| `supabase/migrations/20260606162111_aquatrak_schema.sql` | 363 | Initial schema: `service_cards`, `attendance`, etc. |
| `supabase/migrations/20260617000000_revenue_intelligence.sql` | 76 | `reminder_responses` and `customer_intelligence` tables |
| `docs/reminder-response-tracking-investigation.md` | 491 | Prior reminder architecture investigation |
