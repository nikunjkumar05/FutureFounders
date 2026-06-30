# Reminder State Machine Audit

**Date:** 2026-06-30
**Branch:** `feat-reminder-state-machine`
**Goal:** Identify every location where reminder timing currently affects customer classification, document the delta from the agreed state machine, then implement the agreed transitions.

---

## Current Behavior vs Agreed State Machine

### 1. `classifySegment()` — `src/lib/customer-intelligence.ts:114`

| Aspect | Current | Required |
|---|---|---|
| **Entry to High Churn Risk** | `daysOverdue > 30` OR `reminder?.status === 'ignored'` OR `storedSegment === 'high_churn_risk'` | Only 10×24 hours after reminder sent |
| **Entry to Ready to Book** | `storedSegment === 'ready_to_book'` OR `reminder?.status === 'responded'` OR `reminder?.status === 'booked'` | No reminder exists for current lifecycle |
| **Entry to Awaiting Follow-up** | `reminder?.status === 'sent'` OR `daysOverdue > 0` OR any reminder exists | Reminder sent < 10 days ago |
| **Not Due** | Not handled — customers with future `next_service_date` reach this function only through indirect paths | Must return `not_due` before reminder-based classification |
| **Due-month split** | Two branches (`isDueThisMonth` vs not) with different rules | No split — unified state machine |
| **Stored segment used** | Yes — `storedSegment` overrides derivation | No — fully derived state |

**Delta:** The agreed state machine uses elapsed time since reminder sent (not overdue days, not reminder status, not stored segment). The `isDueThisMonth` dual-branch logic is not part of the agreed machine. `storedSegment` should not influence classification.

---

### 2. `calcHealthScore()` — `src/lib/customer-intelligence.ts:88`

| Aspect | Current | Required |
|---|---|---|
| **Reminder-based penalty** | -20 for `ignored`, -10 for `sent` | No change needed — health score is a display value, not a state machine input |
| **Overdue penalty** | `min(daysOverdue * 1.5, 60)` | No change needed |

**Delta:** None — health score is cosmetic and does not drive state transitions.

---

### 3. `deriveCustomerIntelligence()` — `src/lib/customer-intelligence.ts:182`

| Aspect | Current | Required |
|---|---|---|
| **Not Due check** | Not present — only `hasActiveJob` is checked before classification | Must check `next_service_date > today` → return `not_due` |
| **Classification** | Calls `classifySegment(storedSegment, latestReminder, daysOverdue, isDueThisMonth)` | Calls `classifySegment(latestReminder)` — simplified signature |

**Delta:** Not Due must be returned as a distinct state before the reminder-based classification runs.

---

### 4. `buildCustomerContext()` — `src/lib/customer-intelligence.ts:290`

| Aspect | Current | Required |
|---|---|---|
| **findLatestReminder scope** | Filtered by `customerId` (pre-PR-4) or `anchor.id` (post-PR-4) | Must use lifecycle-scoped lookup (PR 4) — no additional change |
| **isDueThisMonth passed** | Yes — used by `classifySegment` | No longer needed by classification; can keep for other callers |

**Delta:** None — PR 4 already scopes reminder lookup to the anchor card.

---

### 5. `useRevenueIntelligence()` — `src/lib/queries.ts:1286`

| Aspect | Current | Required |
|---|---|---|
| **`deriveCustomerIntelligence` calls** | Use `latestReminderByCustomer.get(cid)` (customer-scoped) | Must use lifecycle-scoped reminder (PR 4) — no additional change |
| **Segmentation buckets** | `readyToBook`, `followUpNeeded`, `highChurnRisk` | Same buckets; `not_due` customers don't enter the due/overdue loops |
| **Transition Priority** | Not enforced — `isDueThisMonth` branch has different precedence | Priority: Scheduled → Not Due → Ready to Book → Awaiting Follow-up → High Churn Risk |
| **confirmedRevenue** | Uses `latestReminderByCustomer.get(c.id)` (customer-scoped) | No change per constraint |

**Delta:** None for the display; the `deriveCustomerIntelligence` calls already use lifecycle-scoped reminders from PR 4.

---

### 6. `refreshCustomerIntelligence()` — `src/lib/customer-intelligence-sync.ts:22`

| Aspect | Current | Required |
|---|---|---|
| **Segment persisted** | Upserts `derived.status as CustomerSegment` | Will now upsert `not_due` — no code change needed; DB column accepts text |
| **Active job handling** | Deletes CI record if active job exists | No change |

**Delta:** None — the upsert already accepts any string segment.

---

## Summary of Required Changes

| # | File | Function | Change |
|---|---|---|---|
| 1 | `src/lib/types.ts:333` | `CustomerSegment` | Add `'not_due' \| 'scheduled'` to union |
| 2 | `src/lib/customer-intelligence.ts:114` | `classifySegment` | Rewrite: time-based, no `storedSegment`, no `isDueThisMonth`, no `daysOverdue` |
| 3 | `src/lib/customer-intelligence.ts:182` | `deriveCustomerIntelligence` | Add Not Due check before classification |
| 4 | `src/lib/customer-intelligence.ts:210` | `deriveCustomerIntelligence` call | Update `classifySegment` call site (fewer args) |
| 5 | `src/lib/customer-intelligence.ts:236` | `findLatestReminder` | Already scoped by `serviceCardId` (PR 4) — no change needed |
| 6 | `src/lib/queries.ts:1359,1378` | `useRevenueIntelligence` | Already uses `findLatestReminder` (PR 4) — no change needed |

**No changes needed:** `customer-intelligence-sync.ts`, `api/webhook/index.ts`, `api/server.js`, `src/components/*`, `src/pages/*`
