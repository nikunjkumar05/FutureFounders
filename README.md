# Operation Overflow App — Water Tank Cleaning Operations Platform
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
     │ Serverless    │  │ Serverless    │  │ Serverless   │
     │ Function     │  │ Function     │  │ Function    │
     │ send-reminder│  │   webhook    │  │   ai-faq    │
     │ (Cron/180d)  │  │ (WhatsApp)   │  │ (North Mini)│
     └──────────────┘  └──────────────┘  └──────────────┘
             │                  │                  │
             ▼                  ▼                  ▼
     ┌──────────────────────────────────────────────────┐
     │           WhatsApp Cloud API (Meta)              │
     │            North Mini API                        │
     └──────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + TypeScript |
| Data Fetching | TanStack Query (React Query) |
| Database | Supabase (PostgreSQL) |
| Serverless Functions | Vercel (frontend + API) |
| AI FAQ | North Mini |
| Messaging | WhatsApp Cloud API (Meta) |
| Deployment | Vercel (frontend + API) |

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
supabase/migrations/20260606162111_operation-overflow-app_schema.sql
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

### Serverless Functions → Vercel

Deploy all functions to Vercel:

```bash
# Deploy the functions
vercel deploy --prod
```

### Cron Job (180-Day Reminders)

Use Vercel Cron by adding to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/send-reminders",
    "schedule": "0 2 * * *"
  }]
}
```

### WhatsApp Webhook

1. Deploy the `webhook` function to Vercel
2. Copy the function URL: `https://<your-vercel-project>.vercel.app/api/webhook`
3. In Meta Developer Console → WhatsApp → Configuration:
   - **Callback URL**: paste the function URL
   - **Verify Token**: match your `WHATSAPP_VERIFY_TOKEN`

## Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `VITE_SUPABASE_URL` | Vercel (FE) | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel (FE) | Yes | Supabase anon key |
| `SUPABASE_URL` | Vercel (API) | Yes | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (API) | Yes | Service role key (server-only) |
| `WHATSAPP_TOKEN` | Vercel (API) | For WhatsApp | Meta WhatsApp access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Vercel (API) | For WhatsApp | Meta phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Vercel (API) | For WhatsApp | Webhook verify token |
| `NORTH_MINI_API_KEY` | Vercel (API) | For AI FAQ | North Mini API key |
| `CRON_SECRET` | Vercel (API) | For Cron | Secret to protect cron endpoint |

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
| AI FAQ (North Mini) | ✅ |
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
├── api/
│   ├── cron/             # Vercel serverless functions
│   │   └── send-reminders.ts
│   ├── webhook/           # WhatsApp webhook handler
│   │   └── index.ts
│   └── ai-faq/            # North Mini AI handler
│       └── index.ts
├── supabase/
│   ├── migrations/        # PostgreSQL schema + triggers
│   └── functions/         # Legacy Edge Functions (Deno)
│       ├── send-reminders/
│       ├── webhook/
│       └── ai-faq/
├── vercel.json
├── .env.example
├── .github/workflows/    # GitHub Actions workflow
│   └── deploy.yml
└── README.md
```

## Demo Script

Run this script to test the AI FAQ functionality:

```bash
# Test the AI FAQ function
node scripts/test-ai-faq.js
```

### scripts/test-ai-faq.js

```javascript
const https = require('https');

const NORTH_MINI_API_KEY = 'xREuLwql7RtsagsI1uXIDdGk6rES7J04mcV12LGm';

async function testAIFaq() {
  const payload = {
    model: "north-mini",
    messages: [
      {
        role: "system",
        content: "You are a customer support assistant for AquaClean Services. We offer water tank cleaning, sofa cleaning, and car seats cleaning. You can ONLY answer questions about: 1) Tank cleaning pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Sofa cleaning pricing (per seat: Rs.500, full sofa set: Rs.1500), 3) Car seats cleaning pricing (per seat: Rs.300, full car interior: Rs.2000), 4) Working hours (Mon-Sat, 8AM-6PM), 5) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Do not add any other text if escalating. Keep answers under 50 words. Be friendly and professional.",
      },
      { role: "user", content: "What are the water tank cleaning prices?" },
    ],
    max_tokens: 150,
    temperature: 0.7,
  };

  const options = {
    hostname: 'api.northmini.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NORTH_MINI_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': JSON.stringify(payload).length
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    res.on('data', (chunk) => {
      try {
        const data = JSON.parse(chunk);
        console.log('Response:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('Raw response:', chunk.toString());
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(JSON.stringify(payload));
  req.end();
}

if (require.main === module) {
  testAIFaq();
}

module.exports = { testAIFaq };
```
