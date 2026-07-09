# AquaTrak Architecture Summary

> Compiled from frontend, backend, database, and lifecycle exploration reports.
> Date: 2026-07-04

---

## 1. Project Overview

AquaTrak is a single-tenant water tank / sofa / carpet cleaning business management SPA. It runs as a React web app (with Capacitor mobile wrappers) backed by Supabase PostgreSQL, with self-hosted WhatsApp integration, AI-powered FAQ bot, Firebase auth, and a lifecycle engine for customer retention.

**Deployment targets**: Vercel (serverless + cron) or Azure VM (Express server).

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript 5.5, Vite 5.4, Tailwind CSS 3.4 |
| **Routing** | React Router DOM 7 |
| **Server State** | TanStack React Query 5 |
| **Client State** | React Context (auth, theme) + local useState |
| **Auth** | Firebase Auth (email/password + Google) |
| **Backend** | Express 5 (Node ≥18, ESM) + Vercel serverless functions |
| **Database** | Supabase PostgreSQL (service_role key on backend, anon key on frontend) |
| **Realtime** | Supabase Realtime CDC → invalidates React Query caches |
| **WhatsApp** | Self-hosted OpenWA server (Baileys library) on localhost:2785 |
| **AI** | Mistral AI (Express/Vercel) + NorthMini (Supabase Edge Functions) |
| **Analytics** | PostHog |
| **Mobile** | Capacitor 6 (Android/iOS wrappers) |
| **Fonts** | Manrope (body), JetBrains Mono (data) |

---

## 3. Directory Structure

```
FutureFounders/
├── src/                           # Frontend application
│   ├── main.tsx                   # Entry: ThemeProvider → App
│   ├── App.tsx                    # Providers, router, query client
│   ├── index.css                  # Tailwind + custom component classes
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Firebase auth state
│   │   └── ThemeContext.tsx        # Dark/light mode
│   ├── components/                # Reusable UI components
│   │   ├── Layout.tsx             # App shell (Sidebar + LowStockAlert + Outlet)
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── ProtectedRoute.tsx     # Auth guard
│   │   ├── RevenueIntelligence.tsx
│   │   ├── DailyBriefing.tsx
│   │   └── ... (TankRing, TimeFilter, ContactPicker, etc.)
│   ├── pages/                     # Route-level page components
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Customers.tsx          # Includes ServiceHistoryModal, VisitCard
│   │   ├── Jobs.tsx               # Kanban board + 6-step wizard
│   │   ├── Inventory.tsx
│   │   ├── Attendance.tsx
│   │   └── SupportTickets.tsx
│   └── lib/                       # Business logic, types, hooks
│       ├── types.ts               # All TypeScript interfaces (483 lines)
│       ├── queries.ts             # All React Query hooks (1700 lines)
│       ├── supabase.ts            # Supabase client (anon key)
│       ├── firebase.ts            # Firebase init
│       ├── analytics.ts           # PostHog wrapper
│       ├── customer-intelligence.ts        # Derivation helpers
│       ├── customer-attention-pipeline.ts   # Canonical attention pipeline
│       ├── lifecycle-transition-engine.ts   # Pure transition engine
│       ├── transition-service.ts            # DB resolution + engine call
│       ├── persist-transition-result.ts     # UPSERT to DB
│       └── ... (timeUtils, timeSaved, monthly-revenue, phone)
├── api/                           # Backend (Express + Vercel functions)
│   ├── server.js                  # Express 5 server (895 lines)
│   ├── webhook/index.ts           # Vercel webhook handler
│   ├── cron/
│   │   ├── send-reminders.ts
│   │   ├── daily-briefing.ts
│   │   ├── stock-alerts.ts
│   │   └── weekly-revenue-insight.ts
│   └── lib/
│       ├── openwa.ts              # OpenWA client
│       ├── retry.ts               # Retry wrapper
│       └── logger.ts              # Structured JSON logger
├── supabase/
│   ├── migrations/                # 13 SQL migration files
│   └── functions/                 # Deno Edge Functions
│       ├── webhook/               # Twilio-style webhook
│       ├── send-reminders/
│       ├── stock-alert/
│       ├── ai-faq/
│       └── resolve-ticket/
├── openwa-server/                 # Self-hosted WhatsApp gateway (Baileys + Express 4)
├── vercel.json                    # Vercel config + cron schedules
└── server.js                      # Root bootstrapper
```

---

## 4. Frontend Architecture

### 4.1 Routing

```
/login          → Login (public, lazy)
/               → ProtectedRoute → Layout → Dashboard
/customers      → ProtectedRoute → Layout → Customers
/inventory      → ProtectedRoute → Layout → Inventory
/attendance     → ProtectedRoute → Layout → Attendance
/jobs           → ProtectedRoute → Layout → Jobs
/tickets        → ProtectedRoute → Layout → SupportTickets
```

All authenticated routes are lazy-loaded via `React.lazy()` + `Suspense`. PostHog pageviews fire on every route change.

### 4.2 State Management Pattern

- **Server state**: TanStack React Query (staleTime: 30s, retry: 1). All DB reads/writes go through `src/lib/queries.ts`.
- **Auth state**: React Context (`AuthContext`) — Firebase `onAuthStateChanged` listener.
- **Theme state**: React Context (`ThemeContext`) — localStorage-persisted dark/light mode.
- **UI state**: Local `useState` for modals, forms, search, step wizards.
- **Realtime**: Supabase `channel()` subscriptions invalidate React Query caches on DB changes (Dashboard, LowStockAlert, SupportTickets).

### 4.3 Pages & Key Functionality

| Page | Key Features |
|------|-------------|
| **Dashboard** | Today's pulse, metric cards (pending jobs, crew in, low stock, time saved), quick actions, system status, Revenue Intelligence widget, Daily Briefing modal |
| **Customers** | List + search + time filter, CRUD modals, duplicate detection, WhatsApp reminder, service history modal with VisitCards |
| **Jobs** | Kanban board (Pending/In Progress/Completed), Google Maps route optimizer, 6-step create wizard, edit/detail/delete modals |
| **Inventory** | Stock bar cards (critical/low/ok/reordered), CRUD, alert history |
| **Attendance** | Daily check-in/out, date selector, staff CRUD, advances, monthly wage calculator + CSV export |
| **SupportTickets** | Two-tab view (Needs Attention / Auto-resolved), resolve via Edge Function |

### 4.4 Data Fetching (queries.ts)

~1700 lines organizing all data access as custom React Query hooks:

**Queries** (useQuery): `useCustomers`, `useServiceCards`, `useStaff`, `useAttendance`, `useInventory`, `useStockAlerts`, `useSupportTickets`, `useDashboardMetrics`, `useTimeSavedMetrics`, `useDailyBriefing`, `useRevenueIntelligence`, `useMonthlyRevenue`, `useMonthlyAttendance`, `useMonthlyAttendanceExport`, `useAdvances`, `useStaffMonthlyAdvances`, `useResolvedAlerts`

**Mutations** (useMutation): `useAddCustomer`, `useUpdateCustomer`, `useDeleteCustomer`, `useCreateJob`, `useUpdateJob`, `useDeleteJob`, `useUpdateJobStatus`, `useAddStaff`, `useUpdateStaff`, `useDeleteStaff`, `useManualCheckIn`, `useManualCheckOut`, `useAddInventory`, `useUpdateInventory`, `useDeleteInventory`, `useResolveAlert`, `useResolveTicket`, `useMarkReminderSent`, `useCreateReminderResponse`, `useSendFeedback`, `useAddAdvance`, `useUpdateAdvance`, `useDeleteAdvance`, `useUpdateCustomerIntelligence`

### 4.5 Analytics

PostHog tracks: pageviews ($pageview), custom events (job_created, job_completed, customer_created, reminder_sent, etc.), user identification on auth state change.

---

## 5. Backend Architecture

### 5.1 Server Instances

Three parallel server implementations, chosen by deployment target:

| Instance | File | Runtime | When Used |
|----------|------|---------|-----------|
| **Express** | `api/server.js` | Node (tsx) | Azure VM / local dev (npm start) |
| **Vercel Functions** | `api/*/index.ts` | Node | Vercel deployment |
| **Supabase Edge** | `supabase/functions/*` | Deno | Supabase-managed |

### 5.2 API Endpoints (Express)

| Route | Description |
|-------|-------------|
| `GET /` | Root health check |
| `GET /api/health` | Full health (OpenWA, Supabase, Mistral) |
| `GET /api/webhook` | Webhook verification |
| `POST /api/webhook` | **Main webhook**: WhatsApp message processing |
| `POST /api/cron/send-reminders` | Daily service reminders |
| `POST /api/cron/daily-briefing` | Daily ops briefing |
| `POST /api/cron/stock-alerts` | Low-stock detection + alert |
| `POST /api/cron/weekly-revenue-insight` | Weekly revenue summary |

### 5.3 Cron Jobs (vercel.json)

| Cron | Schedule | Description |
|------|----------|-------------|
| send-reminders | Daily 2 AM | Sends WhatsApp to due customers, creates reminder_responses, triggers transition |
| daily-briefing | Daily 9 AM | Builds ops summary, sends via WhatsApp to merchant |
| stock-alerts | Daily 8 AM | Checks inventory thresholds, creates alerts |
| weekly-revenue-insight | Sunday 9 AM | Revenue forecast + non-responder report |

All crons protected by `CRON_SECRET` bearer token.

### 5.4 Webhook Implementations (3-way comparison)

| Feature | Express (server.js) | Vercel (webhook/index.ts) | Supabase Edge |
|---------|-------------------|--------------------------|---------------|
| Body | JSON | JSON | Form-encoded |
| Bot routing (GREETING → BOT/HUMAN) | Full state machine | None | None |
| Customer booking via reply | Yes | Yes | No |
| Staff check-in (geolocation) | Yes | Yes | Yes |
| Staff checkout | Yes | Yes | Yes |
| Job completion flow | Yes (UPI link) | Yes (UPI link) | No |
| AI provider | Mistral (tool calls) | Mistral (basic) | NorthMini |
| Transition service calls | No | Yes (evaluate+persist) | No |
| Idempotency | Yes | Yes + cleanup RPC | No |
| LID resolution | Yes | Yes | No |

### 5.5 Middleware & Infrastructure

- No Express `cors` package — manual CORS headers
- No rate limiting, helmet, compression, or request validation middleware
- Database access: raw `fetch()` to Supabase REST API with `service_role` key (backend), Supabase JS client with `anon` key (frontend)
- OpenWA WhatsApp gateway at `localhost:2785`, protected by `X-API-Key`

---

## 6. Database Schema

### 6.1 Migration History (13 migrations)

| # | Migration | Key Change |
|---|-----------|------------|
| 1 | Initial schema | 11 tables (merchants, staff, customers, service_cards, attendance, inventory, etc.), RLS, inventory trigger |
| 2 | Service columns | JSONB service_details, feedback columns, drop tank_capacity_liters |
| 3 | Unique phone | UNIQUE(merchant_id, phone) on customers |
| 4 | Complete schema snapshot | Extensions, refined types, 22 indexes, RLS → authenticated only |
| 5 | Auth prep | RLS recreated for authenticated role |
| 6 | Disable RLS | RLS disabled on all tables (single-tenant, anon key) |
| 7 | Multi-service jobs | job_services table, total_charge column |
| 8 | Revenue intelligence | reminder_responses + customer_intelligence tables |
| 9 | Flexible wages | wage_type/wage_amount on staff, advances table |
| 10 | Enhance job_services | quantity, capacity_or_variant, notes columns |
| 11 | Drop phone unique | Dynamic removal of all phone unique constraints |
| 12 | Bot infrastructure | webhook_idempotency table, cleanup RPC, merchant_id on support_tickets |
| 13 | Job discount | discount column on service_cards |

### 6.2 Complete Table Map (16 tables)

**Core Business**: `merchants`, `customers`, `staff`, `service_cards`, `job_services`

**Operations**: `attendance`, `advances`

**Inventory**: `inventory`, `inventory_transactions`, `service_inventory_requirements`, `stock_alerts`

**Revenue Intelligence**: `reminder_responses`, `customer_intelligence`

**Infrastructure**: `cron_logs`, `support_tickets`, `webhook_idempotency`

### 6.3 Key Tables Detail

**service_cards** — Central business entity:
- `service_details` JSONB (legacy flat fields or newer `{services, totalCharge}`)
- `job_status` enum: `pending | in_progress | completed`
- `auto_deduct_inventory` trigger fires on completion
- `reminder_sent_at` (legacy, being deprecated by reminder_responses)

**reminder_responses** — Reminder tracking:
- Status lifecycle: `sent → responded → booked` (or `ignored`)
- FK chain: `service_card_id → customers → merchants`

**customer_intelligence** — Cached lifecycle state:
- `UNIQUE(merchant_id, customer_id)` — one row per customer
- `segment`: `ready_to_book | follow_up_needed | high_churn_risk | unknown`
- Populated by `persistTransitionResult()` via UPSERT

**webhook_idempotency** — Deduplication:
- `key TEXT PK` (natural key from payload)
- `cleanup_idempotency_keys()` RPC deletes rows >7 days old

### 6.4 Indexes

36 indexes across all tables. Key ones: `service_cards(next_service_date)`, `service_cards(customer_id)`, `reminder_responses(status)`, `customer_intelligence(segment)`, `attendance(staff_id, date)`.

### 6.5 Foreign Key Relationships

All FKs use `ON DELETE CASCADE` except `service_cards.technician_id → staff(id)` which uses `ON DELETE SET NULL`.

---

## 7. Lifecycle & Customer Intelligence

### 7.1 Architecture (Layered Pure Functions)

```
DB (service_cards + reminder_responses)
        │
        ▼
Transition Service (transition-service.ts)
  - Resolves DB inputs (service cards, reminders, previous CI state)
  - Delegates to engine
  - No side effects
        │
        ▼
Lifecycle Transition Engine (lifecycle-transition-engine.ts)
  - evaluateTransition(): determines transitionType, lifecycleState,
    reminderState, attentionState, health score
  - Pure function: same inputs → same outputs
        │
        ▼
Customer Attention Pipeline (customer-attention-pipeline.ts)
  - evaluateCustomerAttention(): builds full attention state
  - Derives attentionState, requiredAction, reminderEligible
        │
        ▼
Customer Intelligence (customer-intelligence.ts)
  - deriveCustomerIntelligence(), classifySegment()
  - estimateServiceValue(), calcHealthScore()
  - Pure helpers
        │
        ▼
Persist Transition Result (persist-transition-result.ts)
  - UPSERTs into customer_intelligence table
  - Fire-and-forget (logs errors, does not throw)
```

### 7.2 Lifecycle States

| State | Condition |
|-------|-----------|
| `scheduled` | Has active pending/in-progress job |
| `not_due` | next_service_date in the future |
| `ready_to_book` | No reminder sent yet |
| `follow_up_needed` | Reminder sent < 240 hours ago |
| `high_churn_risk` | Reminder sent ≥ 240 hours ago |

### 7.3 Transition Events

`job_created`, `job_completed`, `job_deleted`, `reminder_sent`, `reminder_responded`, `reminder_booked`, `reminder_ignored`, `temporal_evaluation`

### 7.4 Consumers

| Consumer | Location | How it Uses Lifecycle |
|----------|----------|----------------------|
| Revenue Intelligence | `queries.ts:1342`, `RevenueIntelligence.tsx` | Runs `evaluateCustomerAttentionBatch`, builds segment buckets, forecast, insights |
| Daily Briefing | `queries.ts:1139`, `daily-briefing.ts` | Runs pipeline, filters `reminderEligible` |
| Dashboard Metrics | `queries.ts:521` | Runs pipeline for `dueReminders` count |
| Send Reminders Cron | `api/cron/send-reminders.ts` | Calls `evaluateTransitionForCustomer` after sending |
| Webhook (Vercel) | `api/webhook/index.ts` | Calls TS on reminder_responded, reminder_booked, job_completed |
| useCreateReminderResponse | `queries.ts:1587` | Calls TS after inserting reminder_response |
| useUpdateJobStatus | `queries.ts:80` | Calls TS on job_completed |
| useCreateJob | `queries.ts:125` | **GAP**: Does NOT call TS |

### 7.5 Known Duplication (from lifecycle-transition-audit.md)

- **16 documented paths** of duplicated lifecycle/transition logic
- Express server.js webhook (paths 9–12): no CI refresh → should be retired
- Supabase Edge send-reminders (path 15): no reminder_responses row → legacy
- Vercel cron send-reminders (path 13): uses raw SQL filter, not pipeline, for eligibility
- Some consumers still duplicate post-pipeline aggregation logic atop canonical results

---

## 8. Key Architectural Decisions & Trade-offs

1. **Three parallel webhook implementations** with divergent feature sets (Express most complete, Edge simplest). Only the Vercel path calls the Transition Service.

2. **Canonical lifecycle layer** (`customer-intelligence.ts → pipeline → engine`) is pure and testable, but consumers like Revenue Intelligence and Daily Briefing still duplicate some aggregation logic on top.

3. **No ORM** — raw Supabase REST API calls via `fetch()` on backend, Supabase JS client on frontend. No Prisma/Drizzle.

4. **Single tenant** — hardcoded merchant ID `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11` throughout.

5. **Firebase Auth + Supabase DB** — Firebase handles auth, Supabase stores data with anon key (RLS disabled).

6. **Client-side lifecycle computation** — computationally intensive pipelines run in the browser inside React Query functions (no server-side derivation API).

7. **JSONB evolution** — service_details started as flat columns, moved to JSONB, then added job_services for proper relational multi-service support.

8. **No database views** — all derived data computed in TypeScript application code.

---

## 9. Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/types.ts` | 483 | All TypeScript interfaces, enums, constants |
| `src/lib/queries.ts` | 1700 | All React Query hooks |
| `src/lib/customer-intelligence.ts` | 303 | Derivation helpers (classifySegment, estimateServiceValue) |
| `src/lib/customer-attention-pipeline.ts` | 400 | Canonical attention pipeline |
| `src/lib/lifecycle-transition-engine.ts` | 378 | Pure transition engine |
| `src/lib/transition-service.ts` | 253 | DB resolution + engine invocation |
| `src/lib/persist-transition-result.ts` | 69 | UPSERT helper |
| `api/server.js` | 895 | Express server |
| `api/webhook/index.ts` | 520 | Vercel webhook handler |
| `api/cron/send-reminders.ts` | 217 | Reminder sending cron |
| `api/lib/openwa.ts` | — | OpenWA client |

---

## 10. Open Issues & Gaps

1. **useCreateJob** does not call the transition service (CI not refreshed after job creation).
2. **Express webhook** (`api/server.js`) does not call the transition service at all (should be retired in favor of Vercel path).
3. **Supabase Edge Functions** webhook is a simplified subset — staff-only, no customer booking, no transition calls.
4. **No server-side lifecycle API** — all pipeline computation is client-side, which could be slow with many customers.
5. **No middleware** for rate limiting, request validation, or security headers on the Express server.
6. **Multiple duplicate cron implementations** (Vercel + Express + Edge) with slightly different behaviors.
