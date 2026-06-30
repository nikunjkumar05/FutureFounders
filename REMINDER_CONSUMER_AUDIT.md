# Reminder Consumer Audit — Lifecycle-Scoped Reminder Ownership

**Date:** 2026-06-30
**Project:** PR 4 — Reminder Ownership / Lifecycle-Scoped Reminders
**Branch:** `feat-reminder-lifecycle-scope`

---

## Executive Summary

Every reminder consumer in the codebase was audited to determine:
1. Current scope (customer_id vs service_card_id vs merchant_id)
2. Whether it needs to change for lifecycle-scoped reminder ownership
3. Impact if changed or left unchanged

The `reminder_responses` table already stores both `customer_id` and `service_card_id`. The `reminder_sent_at` column on `service_cards` is inherently per-card. The core change is re-keying **reminder lookups** from `customer_id` → `service_card_id` (the lifecycle anchor), while leaving **aggregate/reporting** consumers on `customer_id` or `merchant_id` scope untouched.

---

## Consumer Inventory

### 1. `findLatestReminder(reminders, customerId)` — `src/lib/customer-intelligence.ts:236`
| Property | Value |
|---|---|
| **Scope** | `customer_id` — filters `r.customer_id !== customerId` |
| **Action** | Read (finds latest reminder by `sent_at` for a given customer) |
| **Called by** | `buildCustomerContext()` |
| **Must change?** | **YES** — must filter by `service_card_id` (the lifecycle anchor) instead |
| **Impact** | This is the root of the bug: old reminders from prior cycles pollute current classification |

### 2. `buildCustomerContext(db, merchantId, customerId, serviceCards)` — `src/lib/customer-intelligence.ts:290`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + `customer_id` — fetches reminders filtered by both |
| **Action** | Read (builds a `CustomerContext` with latestReminder, serviceCards, etc.) |
| **Called by** | `refreshCustomerIntelligence()` |
| **Must change?** | **YES** — must pass the anchor `service_card_id` instead of (or in addition to) `customer_id` to `findLatestReminder` |
| **Impact** | Determines which reminder feeds into segment classification and health score |

### 3. `findLatestReminder` call inside `deriveCustomerIntelligence` — `src/lib/customer-intelligence.ts:182`
| Property | Value |
|---|---|
| **Scope** | Accepts `latestReminder` from input (already resolved upstream) |
| **Action** | Pass-through to `calcHealthScore()` and `classifySegment()` |
| **Must change?** | **NO** — it receives the already-resolved reminder; no scope logic here |

### 4. `refreshCustomerIntelligence()` — `src/lib/customer-intelligence-sync.ts:33`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + `customer_id` — fetches `reminder_responses` filtered by both |
| **Action** | Read (fetches reminders for a customer, passes to `buildCustomerContext`) |
| **Must change?** | **YES** — must also filter by the anchor `service_card_id` when fetching reminders, to get only the current-lifecycle reminder |
| **Impact** | Controls which reminder the CI derivation pipeline uses |

### 5. `useRevenueIntelligence()` — `src/lib/queries.ts:1301`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` — fetches ALL `reminder_responses` for merchant |
| **Action** | Read (builds `latestReminderByCustomer` Map keyed by `customer_id`) |
| **Must change?** | **PARTIAL** — the aggregate metrics (totalSent, conversionRate) must remain merchant-scoped (per constraint). The `deriveCustomerIntelligence` calls that use `latestReminderByCustomer.get(customer_id)` to build per-customer intelligence **must** use lifecycle-scoped lookup instead. |
| **Impact** | Revenue Intelligence dashboard totals unchanged; per-customer CI derivation within the hook switches to lifecycle scope |

### 6. Webhook — `api/webhook/index.ts:144`
| Property | Value |
|---|---|
| **Scope** | `customer_id` + `status=sent` — finds latest reminder by `customer_id` |
| **Action** | Read + Write (finds the active reminder, updates to `responded`, later to `booked`) |
| **Must change?** | **YES** — must also filter by `service_card_id` (the anchor card) to avoid updating a reminder from a prior cycle |
| **Impact** | Prevents stale reminder updates when a customer has multiple lifecycle cycles |

### 7. Webhook Legacy — `api/server.js:532`
| Property | Value |
|---|---|
| **Scope** | `customer_id` + `status=sent` |
| **Action** | Read + Write (same as #6 but in legacy JS server) |
| **Must change?** | **YES** — same reasoning as #6 |
| **Impact** | Same as #6 |

### 8. Cron: `api/cron/send-reminders.ts` (modern TypeScript)
| Property | Value |
|---|---|
| **Scope** | `reminder_sent_at IS NULL` on `service_cards` (per-card) |
| **Action** | Read + Write (reads cards needing reminders, writes `reminder_sent_at`, inserts `reminder_responses` with `service_card_id`) |
| **Must change?** | **NO** — already correctly scoped per service card. Correctly writes `service_card_id` to `reminder_responses`. |
| **Impact** | None — this cron already does the right thing |

### 9. Cron: `api/server.js:640` (legacy send-reminders)
| Property | Value |
|---|---|
| **Scope** | `reminder_sent_at IS NULL` on `service_cards` |
| **Action** | Read + Write (same as #8 but missing `reminder_responses` insert and CI refresh) |
| **Must change?** | **NO** — it does not touch `reminder_responses` at all; no lifecycle scope issue |
| **Impact** | None — though it is incomplete (missing response tracking) |

### 10. Cron: `supabase/functions/send-reminders/index.ts` (Supabase Edge Function)
| Property | Value |
|---|---|
| **Scope** | `reminder_sent_at IS NULL` on `service_cards` |
| **Action** | Read + Write (same pattern, missing `reminder_responses` insert) |
| **Must change?** | **NO** — no `reminder_responses` interaction |
| **Impact** | None |

### 11. Cron: `api/cron/daily-briefing.ts:170`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + `reminder_sent_at IS NULL` on `service_cards` |
| **Action** | Read (reads from service_cards for the briefing, builds `BriefingReminder[]`) |
| **Must change?** | **NO** — reads `service_cards` directly, not `reminder_responses`; already per-card scoped |
| **Impact** | None |

### 12. Cron: `api/cron/weekly-revenue-insight.ts:52`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + `status=sent` on `reminder_responses` |
| **Action** | Read (finds non-responders for weekly revenue insight WhatsApp message) |
| **Must change?** | **NO** — aggregate reporting view; per constraint, no Revenue Intelligence changes |
| **Impact** | None |

### 13. `useMarkReminderSent()` — `src/lib/queries.ts:423`
| Property | Value |
|---|---|
| **Scope** | Per `service_card_id` — updates `reminder_sent_at` by card ID |
| **Action** | Write (sets `reminder_sent_at` on a specific service card) |
| **Must change?** | **NO** — already per-card scoped |
| **Impact** | None |

### 14. `useCreateReminderResponse()` — `src/lib/queries.ts:1505`
| Property | Value |
|---|---|
| **Scope** | Accepts `serviceCardId`, `customerId`, `status` |
| **Action** | Write (inserts `reminder_responses` with all FK scopes) |
| **Must change?** | **NO** — already correctly stores `service_card_id` |
| **Impact** | None |

### 15. `useTimeSavedMetrics()` — `src/lib/queries.ts:441`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + date range |
| **Action** | Read (counts reminders sent and responses for time-saved metrics) |
| **Must change?** | **NO** — aggregate metric, no lifecycle scope needed |
| **Impact** | None |

### 16. `useDashboardMetrics()` — `src/lib/queries.ts:500`
| Property | Value |
|---|---|
| **Scope** | `merchant_id` + `reminder_sent_at IS NULL` |
| **Action** | Read (counts pending reminders for dashboard widget) |
| **Must change?** | **NO** — reads from `service_cards`, already per-card |
| **Impact** | None |

### 17. `Customers.tsx` — Send Reminder UI — `src/pages/Customers.tsx:220`
| Property | Value |
|---|---|
| **Scope** | Uses `latestCard.id` to mark sent and create response |
| **Action** | Write (calls `useMarkReminderSent` and `useCreateReminderResponse`) |
| **Must change?** | **NO** — already uses service card ID; creates `reminder_responses` with correct FK |
| **Impact** | None |

### 18. Dashboard realtime subscription — `src/pages/Dashboard.tsx:67`
| Property | Value |
|---|---|
| **Scope** | Table-level on `reminder_responses` |
| **Action** | Subscribes to all changes on `reminder_responses` table |
| **Must change?** | **NO** — subscription invalidates cache; no scope logic |
| **Impact** | None |

### 19. Revenue Intelligence UI — `src/components/RevenueIntelligence.tsx:143`
| Property | Value |
|---|---|
| **Scope** | Reads from pre-computed `data.reminderAnalytics` |
| **Action** | Display (renders aggregated reminder metrics) |
| **Must change?** | **NO** — display-only, no scope logic |
| **Impact** | None |

### 20. Daily Briefing UI — `src/components/DailyBriefing.tsx:154`
| Property | Value |
|---|---|
| **Scope** | Reads `reminders` from briefing data (pre-computed from service_cards) |
| **Action** | Display (renders reminder list) |
| **Must change?** | **NO** — display-only |
| **Impact** | None |

---

## Database Schema Reference

### `reminder_responses` table
| Column | Type | Scope |
|---|---|---|
| `id` | UUID | PK |
| `service_card_id` | UUID (FK → service_cards) | Lifecycle anchor ✅ |
| `merchant_id` | UUID (FK → merchants) | Tenant |
| `customer_id` | UUID (FK → customers) | Customer |
| `sent_at` | timestamptz | — |
| `responded_at` | timestamptz | — |
| `response` | text | — |
| `status` | text (CHECK: sent/responded/booked/ignored) | — |
| `notes` | text | — |
| `created_at` | timestamptz | — |

### Indexes
- `idx_reminder_responses_merchant_id` — on `merchant_id`
- `idx_reminder_responses_customer_id` — on `customer_id`
- `idx_reminder_responses_service_card_id` — on `service_card_id` ✅
- `idx_reminder_responses_status` — on `status`

---

## Change Plan

| # | File | Function | Change |
|---|---|---|---|
| 1 | `src/lib/customer-intelligence.ts:236` | `findLatestReminder` | Re-key from `customerId` to `serviceCardId`; filter by `service_card_id` instead of `customer_id` |
| 2 | `src/lib/customer-intelligence-sync.ts:33` | `refreshCustomerIntelligence` | Pass the anchor `service_card_id` to `buildCustomerContext`/`findLatestReminder` instead of `customer_id` |
| 3 | `src/lib/customer-intelligence.ts:290` | `buildCustomerContext` | Accept `serviceCardId` parameter; use it in `findLatestReminder` call |
| 4 | `src/lib/queries.ts:1280` | `useRevenueIntelligence` | Change `deriveCustomerIntelligence` calls to use lifecycle-scoped reminder lookup per customer (keep aggregate metrics merchant-scoped) |
| 5 | `api/webhook/index.ts:144` | webhook handler | Add `service_card_id` filter when looking up active reminder |
| 6 | `api/server.js:532` | webhook handler (legacy) | Same as #5 |

### Files with NO changes needed (16 of 22 consumers):
`api/cron/send-reminders.ts`, `api/server.js:640`, `supabase/functions/send-reminders/index.ts`, `api/cron/daily-briefing.ts`, `api/cron/weekly-revenue-insight.ts`, `src/lib/queries.ts` (useMarkReminderSent, useCreateReminderResponse, useTimeSavedMetrics, useDashboardMetrics), `src/pages/Customers.tsx`, `src/pages/Dashboard.tsx`, `src/components/RevenueIntelligence.tsx`, `src/components/DailyBriefing.tsx`, `src/lib/customer-intelligence.ts:182` (deriveCustomerIntelligence — pass-through only)
