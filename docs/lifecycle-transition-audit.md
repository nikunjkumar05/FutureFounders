# Lifecycle Transition Engine — Architecture Audit

> This document catalogs every component in the AquaTrak codebase that
> independently initiates lifecycle transitions, duplicating business logic
> that belongs in the Lifecycle Transition Engine.

## Audit methodology

Each entry identifies:
- The file, function, and line number.
- The business event handled.
- What lifecycle logic is duplicated.
- Whether the path should eventually consume the Transition Engine.

---

### 1. `src/lib/queries.ts :: useCreateJob()` (lines 117–198)

- **Event:** Job Created
- **Duplicated logic:** Creates a pending job, setting `next_service_date = serviceDate + 180d`. Does **not** call `refreshCustomerIntelligence()` (gap). Infers "customer is now scheduled" by side effect of the DB write.
- **Should consume engine?** Yes — active-job override detection after job creation.
- **Notes:** CI refresh gap means the lifecycle state is never persisted.

### 2. `src/lib/queries.ts :: useUpdateJobStatus()` (lines 77–114)

- **Event:** Job Completed
- **Duplicated logic:** Sets `next_service_date = service_date + 180d` on completion. Calls `refreshCustomerIntelligence()` only when completed. Implicitly triggers transition from `scheduled` → `not_due`/`ready_to_book`.
- **Should consume engine?** Yes — cycle-completion transition evaluation.

### 3. `src/lib/queries.ts :: useCreateReminderResponse()` (lines 1513–1558)

- **Event:** Reminder Sent / Responded / Booked / Ignored
- **Duplicated logic:** Inserts `reminder_responses` row with appropriate status. Calls `refreshCustomerIntelligence()` unconditionally. Implicitly triggers reminder-state transitions.
- **Should consume engine?** Yes — reminder-transition evaluation.

### 4. `src/lib/queries.ts :: useMarkReminderSent()` (lines 431–446)

- **Event:** Reminder Sent (legacy path)
- **Duplicated logic:** Sets `reminder_sent_at = now()` but does **not** create `reminder_responses`. The CI derivation ignores `reminder_sent_at`, so this has no lifecycle effect — it is a dead path for lifecycle purposes.
- **Should consume engine?** No — this path is deprecated and should be retired.

### 5. `src/lib/queries.ts :: useUpdateCustomerIntelligence()` (lines 1560–1588)

- **Event:** Manual CI Override
- **Duplicated logic:** Directly upserts `customer_intelligence` with caller-specified segment. Bypasses the derivation entirely.
- **Should consume engine?** No — this is a manual override escape hatch, not a lifecycle transition.

### 6. `api/webhook/index.ts` — customer "yes"/"confirm"/"haan" (lines 150–171)

- **Event:** Reminder Responded
- **Duplicated logic:** Patches `reminder_responses.status = 'responded'`. Calls `refreshCustomerIntelligence()`.
- **Should consume engine?** Yes — reminder-transition evaluation.

### 7. `api/webhook/index.ts` — customer "morning"/"afternoon" (lines 172–229)

- **Event:** Booking Created (via Reminder Booked)
- **Duplicated logic:** Creates `service_cards` row with `job_status = 'pending'`. Patches `reminder_responses.status = 'booked'`. Calls `refreshCustomerIntelligence()`. Does **not** set `next_service_date` (gap).
- **Should consume engine?** Yes — active-job override detection after booking.

### 8. `api/webhook/index.ts` — staff "done"/"completed"/"complete" (lines 323–349)

- **Event:** Job Completed
- **Duplicated logic:** Patches `service_cards.job_status = 'completed'`. Calls `refreshCustomerIntelligence()`. Does **not** set `next_service_date` (gap vs UI path).
- **Should consume engine?** Yes — cycle-completion transition evaluation.

### 9. `api/server.js` — customer "yes"/"confirm"/"haan" (lines 535–542)

- **Event:** Reminder Responded
- **Duplicated logic:** Same as #6 but does **not** call `refreshCustomerIntelligence()`.
- **Should consume engine?** Yes — but this path must first be brought to parity with the modern webhook.

### 10. `api/server.js` — customer "morning"/"afternoon" (lines 543–555)

- **Event:** Booking Created
- **Duplicated logic:** Same as #7 but does **not** call `refreshCustomerIntelligence()`.
- **Should consume engine?** Yes — same note as #9.

### 11. `api/server.js` — staff "done"/"completed"/"complete" (lines 609–626)

- **Event:** Job Completed
- **Duplicated logic:** Same as #8 but does **not** call `refreshCustomerIntelligence()`.
- **Should consume engine?** Yes — same note as #9.

### 12. `api/server.js` — AI booking tool (lines 230–267)

- **Event:** Booking Created (AI-driven)
- **Duplicated logic:** Creates customer (upsert) and `service_cards` row. Does **not** set `next_service_date` (gap). Does **not** call `refreshCustomerIntelligence()` (gap).
- **Should consume engine?** Yes — active-job override detection after AI booking.

### 13. `api/cron/send-reminders.ts` — Vercel cron (lines 1–212)

- **Event:** Reminder Sent
- **Duplicated logic:** Patches `reminder_sent_at = now()`. Creates `reminder_responses` row with status = `sent`. Calls `refreshCustomerIntelligence()` after each send.
- **Should consume engine?** Yes — reminder-transition evaluation.
- **Notes:** This is the most complete cron path. The Express and Edge Function duplicates should be retired in a future PR.

### 14. `api/server.js` — send-reminders cron (lines 646–685)

- **Event:** Reminder Sent
- **Duplicated logic:** Patches `reminder_sent_at = now()` only. Does **not** create `reminder_responses` row (gap). Does **not** call `refreshCustomerIntelligence()` (gap).
- **Should consume engine?** No — this path is incomplete and should be retired.

### 15. `supabase/functions/send-reminders/index.ts` — Edge Function cron (lines 51–115)

- **Event:** Reminder Sent
- **Duplicated logic:** Patches `reminder_sent_at = now()` only. Does **not** create `reminder_responses` row (gap). Does **not** call `refreshCustomerIntelligence()` (gap).
- **Should consume engine?** No — this path is incomplete and should be retired.

### 16. `scripts/migrate-customers.js` — CSV import (lines 39–41)

- **Event:** Customer Import (creates service cards)
- **Duplicated logic:** Creates `service_cards` with `next_service_date = lastServiceDate + 180d`. Does **not** call `refreshCustomerIntelligence()`.
- **Should consume engine?** No — migration script, one-time operation.

---

## Summary

| Metric | Count |
|---|---|
| Total independent lifecycle-transition paths identified | 16 |
| Paths containing logic that belongs in the Transition Engine | 10 |
| Paths that are incomplete/retired | 2 (`useMarkReminderSent`, duplicate crons) |
| Manual override escape hatch | 1 (`useUpdateCustomerIntelligence`) |
| One-time migration script | 1 (`scripts/migrate-customers.js`) |
| Files involved | `queries.ts`, `api/webhook/index.ts`, `api/server.js`, `api/cron/send-reminders.ts`, `supabase/functions/send-reminders/index.ts`, `scripts/migrate-customers.js` |

---

## Required business transitions (from architectural specification)

| ID | Transition | Engine support |
|---|---|---|
| T1 | Lifecycle Start: First completed card creates a lifecycle | ✅ |
| T2 | Cycle Completion: Anchor card completed → new lifecycle begins | ✅ |
| T3 | Cycle Reset: Newer completed card replaces old anchor | ✅ |
| T4 | Reminder Sent: Reminder response created → lifecycle re-evaluated | ✅ |
| T5 | Reminder Responded: Customer replies → reminder state advances | ✅ |
| T6 | Reminder Booked: Booking created → new active job | ✅ |
| T7 | Reminder Ignored: 240h timeout → lifecycle re-evaluated | ✅ |
| T8 | Date Reached: next_service_date passes → lifecycle re-evaluated | ✅ |
| T9 | Active Job Created: New pending/in_progress job → scheduled override | ✅ |
| T10 | Active Job Removed: Active job deleted or completed → override lifted | ✅ |

All 10 required transitions are covered by the engine.
