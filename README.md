# AquaTrak — Water Tank Cleaning Operations Platform
### App Link : https://futurefounders-ruddy.vercel.app/
Lean SMB operations platform for water tank cleaning businesses. Built for the OKCredit Future Founder Hackathon.

## Architecture

```
                    ┌──────────────────────┐
                    │   React + Vite SPA   │
                    │   (Vercel Static)    │
                    └──────┬───────────────┘
                           │ Supabase JS Client
                    ┌──────▼───────────────┐
                    │     Supabase (REST)  │
                    │   PostgreSQL + RLS   │
                    └──┬───────┬───────┬───┘
                       │       │       │
            ┌──────────┘       │       └──────────┐
            ▼                  ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Edge Function│  │ Edge Function│  │ Edge Function│
    │ send-reminder│  │   webhook    │  │   ai-faq     │
    │ (Cron/180d)  │  │ (WhatsApp)   │  │ (Gemini FAQ) │
    └──────────────┘  └──────────────┘  └──────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
    ┌──────────────────────────────────────────────────┐
    │           WhatsApp Cloud API (Meta)              │
    │            Gemini 1.5 Flash API                 │
    └──────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + TypeScript |
| Data Fetching | TanStack Query (React Query) |
| Database | Supabase (PostgreSQL) |
| Edge Functions | Supabase Edge Functions (Deno) |
| AI FAQ | Gemini 1.5 Flash |
| Messaging | WhatsApp Cloud API (Meta) |
| Deployment | Vercel (frontend) + Supabase (backend) |

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd futurefounders
npm install
```

### 2. Environment variables

Copy the example env file:

```bash
cp .env.example .env
```

Fill in your Supabase project URL and anon key (these are safe for client-side use).

### 3. Run the schema

Open your Supabase dashboard → SQL Editor and paste the contents of:

```
supabase/migrations/20260606162111_aquatrak_schema.sql
```

This creates all tables, indexes, RLS policies, the inventory trigger, and seed data.

### 4. Start development

```bash
npm run dev
```

Open http://localhost:5173

## Deployment

### Frontend → Vercel

**Automatic (recommended):**
1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Import repo
3. Set framework to **Vite**
4. Add environment variables (from `.env.example`)
5. Deploy

**Manual:**
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Edge Functions → Supabase

Install the Supabase CLI and deploy:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref bopshpvbesxnakhogfdc

# Deploy all functions
supabase functions deploy send-reminders
supabase functions deploy webhook
supabase functions deploy ai-faq
```

### Cron Job (180-Day Reminders)

In your Supabase dashboard:
1. Go to **Database** → **Triggers**
2. Add a scheduled function to call the `send-reminders` Edge Function daily at 8:00 AM IST (2:00 AM UTC)
3. Pass `CRON_SECRET` as the authorization header

Alternatively, use Vercel Cron by adding to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/send-reminders",
    "schedule": "0 2 * * *"
  }]
}
```

### WhatsApp Webhook

1. Deploy the `webhook` Edge Function to Supabase
2. Copy the function URL: `https://bopshpvbesxnakhogfdc.supabase.co/functions/v1/webhook`
3. In Meta Developer Console → WhatsApp → Configuration:
   - **Callback URL**: paste the function URL
   - **Verify Token**: match your `WHATSAPP_VERIFY_TOKEN`

## Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `VITE_SUPABASE_URL` | Vercel (FE) | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel (FE) | Yes | Supabase anon key |
| `SUPABASE_URL` | Edge Functions | Yes | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Yes | Service role key (server-only) |
| `WHATSAPP_TOKEN` | Edge Functions | For WhatsApp | Meta WhatsApp access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Edge Functions | For WhatsApp | Meta phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Edge Functions | For WhatsApp | Webhook verify token |
| `GEMINI_API_KEY` | Edge Functions | For AI FAQ | Google Gemini API key |
| `CRON_SECRET` | Edge Functions | For Cron | Secret to protect cron endpoint |

## Feature Status

| Feature | Status |
|---------|--------|
| Dashboard with live metrics | ✅ |
| Customer management + wa.me reminders | ✅ |
| Inventory tracking with progress bars | ✅ |
| Job Kanban board (Pending / In Progress / Completed) | ✅ |
| Auto-inventory deduction trigger | ✅ |
| Low stock alerts | ✅ |
| Staff attendance (manual override) | ✅ |
| Monthly wage calculator | ✅ |
| WhatsApp geofenced check-in/out | ✅ |
| AI FAQ (Gemini 1.5 Flash) | ✅ |
| Support tickets dashboard | ✅ |
| 180-day reminder cron engine | ✅ |
| CSV data migration script | 🚧 |
| CSV attendance export | 🚧 |

## Project Structure

```
futurefounders/
├── src/
│   ├── components/        # Shared UI components
│   │   ├── Layout.tsx     # App shell with sidebar
│   │   ├── Sidebar.tsx    # Navigation sidebar
│   │   ├── LowStockAlert.tsx
│   │   └── LoadingSkeleton.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Customers.tsx
│   │   ├── Inventory.tsx
│   │   ├── Attendance.tsx
│   │   ├── Jobs.tsx
│   │   └── SupportTickets.tsx
│   └── lib/
│       ├── supabase.ts    # Supabase client
│       ├── queries.ts     # TanStack Query hooks
│       └── types.ts       # TypeScript types
├── supabase/
│   ├── migrations/        # PostgreSQL schema + triggers
│   └── functions/         # Edge Functions (Deno)
│       ├── send-reminders/
│       ├── webhook/
│       └── ai-faq/
├── vercel.json
├── .env.example
└── README.md
```
