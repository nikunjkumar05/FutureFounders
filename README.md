# AquaOps — Water Tank Cleaning Operations Engine

A lean, API-driven SMB operations platform built with **React**, **Node.js**, and **Supabase (PostgreSQL)**, deployed on **Vercel**. Built for the OkCredit Future Founders program.

## Features

- **Job Queue** — Create, track, and complete cleaning jobs with one click
- **Smart Inventory** — Auto-deduct chemical stock via PostgreSQL triggers when a job is marked complete
- **Attendance** — Manual check-in override for field workers (WhatsApp geolocation webhook ready)
- **180-Day Reminders** — Automated re-service reminders via wa.me links (WhatsApp Cloud API phase 2 ready)
- **AI Chatbot** — AquaBot powered by NVIDIA GLM-5.1, strictly scoped to pricing, hours, and capacity FAQs
- **Metrics Dashboard** — Live view of completed jobs, low stock alerts, and due reminders

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS v4 + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (via Docker / Supabase) |
| AI | NVIDIA API (z-ai/glm-5.1) |
| Fonts | Syne (headings), DM Mono (numbers), Plus Jakarta Sans (body) |

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Docker Desktop** (for local PostgreSQL)
- A **NVIDIA API key** (optional — chatbot falls back to keyword classifier without it)

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd futurefounders

# Install API dependencies
cd apps/api && npm install && cd ../..

# Install web dependencies
cd apps/web && npm install && cd ../..
```

### 2. Start PostgreSQL

```bash
docker run -d \
  --name futurefounders-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=futurefounders \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Run Migrations

```bash
Get-Content supabase/migrations/001_schema.sql | docker exec -i futurefounders-pg psql -U postgres -d futurefounders
Get-Content supabase/migrations/002_inventory_trigger.sql | docker exec -i futurefounders-pg psql -U postgres -d futurefounders
Get-Content supabase/seed.sql | docker exec -i futurefounders-pg psql -U postgres -d futurefounders
```

### 4. Configure Environment (Optional)

Copy the example env and add your NVIDIA API key:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```
NVIDIA_API_KEY=nvapi-your-key-here
```

Without this key, AquaBot uses a local keyword classifier.

### 5. Start Servers

```bash
# Terminal 1 — API (port 3001)
cd apps/api && npx tsx src/index.ts

# Terminal 2 — Dashboard (port 5173)
cd apps/web && npx vite --host 127.0.0.1
```

### 6. Open Dashboard

Navigate to **http://127.0.0.1:5173**

## Project Structure

```
futurefounders/
├── apps/
│   ├── api/                # Express API server
│   │   ├── src/index.ts    # All routes: jobs, inventory, metrics, reminders, attendance, chat
│   │   └── .env            # NVIDIA_API_KEY (optional)
│   └── web/                # React + Vite dashboard
│       ├── src/
│       │   ├── App.tsx          # Main layout with grid, header, progress bar
│       │   ├── api.ts           # API client functions
│       │   ├── types.ts         # TypeScript interfaces
│       │   └── components/
│       │       ├── MetricsBar.tsx      # 3 metric cards with sine-wave & animation
│       │       ├── JobList.tsx         # Job queue with status accents
│       │       ├── ReminderQueue.tsx    # 180-day reminder list with wa.me links
│       │       ├── AttendancePanel.tsx # Worker check-in with manual override
│       │       ├── InventoryPanel.tsx  # Stock levels with gradient bars
│       │       └── AquaBot.tsx         # AI chatbot (NVIDIA / keyword fallback)
│       └── index.html
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql           # 9 tables + indexes
│   │   └── 002_inventory_trigger.sql # Auto-deduct, low-stock warning, geofence
│   └── seed.sql                      # Test data
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs/:id/complete` | Mark job complete (triggers inventory deduction) |
| GET | `/api/inventory` | List inventory with low-stock flags |
| GET | `/api/metrics` | Dashboard metrics (completed today, low stock, reminders) |
| GET | `/api/reminders` | List service reminders |
| POST | `/api/reminders/:id/send` | Mark reminder as sent |
| GET | `/api/attendance` | Worker attendance with check-in status |
| POST | `/api/attendance/checkin` | Manual check-in override |
| GET | `/api/workers` | List active workers |
| POST | `/api/chat` | AI chat (NVIDIA GLM-5.1 or keyword fallback) |

## Keyboard Actions

- **Mark Complete** on any scheduled job — instantly deducts inventory, creates 180-day reminder, sets timestamp
- **MARK PRESENT** on a worker — logs an on-time check-in
- **WhatsApp icon** in Reminder Queue — opens pre-filled wa.me link with service reminder message

## Theme

Dark industrial theme:
- Background: `#06080f`
- Cards: `#0c0f17` with `#1a1d27` borders
- Accent: Cyan `#14b8a6`, Orange `#f97316`, Red `#ef4444`
- Glass-morphism: `rgba(255,255,255,0.03)` with `blur(20px)`
