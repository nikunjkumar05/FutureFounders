import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import express from "express";
import cors from "cors";
import pg from "pg";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "futurefounders",
});

// ─── Jobs ────────────────────────────────────────────
app.get("/api/jobs", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT j.id, j.status, j.scheduled_date::text, j.completed_at::text,
           j.site_lat, j.site_lng,
           c.name AS customer, w.name AS worker
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    LEFT JOIN workers w ON w.id = j.worker_id
    ORDER BY j.created_at DESC
  `);
  res.json(rows);
});

app.post("/api/jobs/:id/complete", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE jobs SET status = 'completed' WHERE id = $1 AND status != 'completed' RETURNING id, status, completed_at`,
    [id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "Job not found or already completed" });
  }
  res.json(rows[0]);
});

// ─── Inventory ───────────────────────────────────────
app.get("/api/inventory", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, name, quantity::text, unit, min_threshold::text,
           quantity < min_threshold AS low_stock
    FROM inventory ORDER BY name
  `);
  res.json(rows);
});

// ─── Metrics ────────────────────────────────────────
app.get("/api/metrics", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM jobs WHERE status = 'completed' AND completed_at >= CURRENT_DATE) AS completed_today,
      (SELECT COUNT(*) FROM inventory WHERE quantity < min_threshold) AS low_stock_count,
      (SELECT COUNT(*) FROM service_reminders WHERE status = 'pending' AND due_date <= CURRENT_DATE + INTERVAL '7 days') AS reminders_due_soon
  `);
  res.json(rows[0]);
});

// ─── Reminders ───────────────────────────────────────
app.get("/api/reminders", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT sr.id, sr.due_date::text, sr.status, sr.sent_at::text,
           c.name AS customer, c.phone, c.address
    FROM service_reminders sr
    JOIN customers c ON c.id = sr.customer_id
    ORDER BY sr.due_date ASC, sr.created_at DESC
  `);
  res.json(rows);
});

app.post("/api/reminders/:id/send", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE service_reminders SET status = 'sent', sent_at = now() WHERE id = $1 AND status = 'pending' RETURNING id, status, sent_at`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Reminder not found or already sent" });
  res.json(rows[0]);
});

// ─── Attendance ──────────────────────────────────────
app.get("/api/attendance", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      w.id, w.name, w.phone,
      j.id AS job_id,
      j.status AS job_status,
      j.site_lat, j.site_lng,
      c.name AS customer,
      ci.status AS check_in_status,
      ci.distance_meters::text,
      ci.received_at::text AS checked_in_at
    FROM workers w
    LEFT JOIN LATERAL (
      SELECT * FROM jobs
      WHERE worker_id = w.id AND status != 'completed'
      ORDER BY created_at DESC LIMIT 1
    ) j ON true
    LEFT JOIN customers c ON c.id = j.customer_id
    LEFT JOIN LATERAL (
      SELECT * FROM check_ins
      WHERE worker_id = w.id AND received_at >= CURRENT_DATE
      ORDER BY received_at DESC LIMIT 1
    ) ci ON true
    WHERE w.active = true
    ORDER BY w.name
  `);
  res.json(rows);
});

app.post("/api/attendance/checkin", async (req, res) => {
  const { worker_id, job_id, lat, lng } = req.body;
  if (!worker_id) return res.status(400).json({ error: "worker_id required" });

  const { rows } = await pool.query(
    `INSERT INTO check_ins (job_id, worker_id, status, reported_lat, reported_lng)
     VALUES ($1, $2, 'on_time', $3, $4)
     RETURNING id, status, distance_meters::text, received_at`,
    [job_id || null, worker_id, lat || null, lng || null]
  );
  res.status(201).json(rows[0]);
});

// ─── AI Chat (NVIDIA API) ────────────────────────────
const SYSTEM_PROMPT = `You are AquaBot, the AI assistant for AquaOps water tank cleaning service. 

You can ONLY answer questions about these 3 topics:
1. **Pricing** — Standard cleaning starts at ₹999 for residential (up to 1000L). Commercial pricing varies.
2. **Hours** — Service slots are 8 AM – 5 PM, Monday through Saturday.
3. **Capacity** — We handle tanks from 500L to 50,000L. Larger tanks require 24hr notice.

You may also answer about:
- **Scheduling / Booking** — Customers can book via WhatsApp or phone call.
- **Chemicals used** — NSF-certified chlorine & anti-bacterial solutions. Safe for drinking after 2hr flush.
- **Emergency** — For leaks/contamination, call +91-99999-99991 immediately.

RULES:
- If a question is about ANY of the topics above, answer it concisely in 1-2 sentences.
- If a question is OFF-TOPIC (anything else), respond: "That's beyond my scope. Let me connect you with the owner."
- Never make up pricing, hours, or capacity numbers.
- Be friendly and professional.`;

const FAQ: Record<string, string> = {
  price: "Our standard water tank cleaning starts at ₹999 for residential tanks up to 1000L.",
  schedule: "You can book via WhatsApp or call. Typical slots are 8 AM – 5 PM, Mon–Sat.",
  chemical: "We use NSF-certified chlorine & anti-bacterial solutions. Safe for drinking water post-flush.",
  emergency: "For emergency leaks or contamination, call us directly at +91-99999-99991.",
};

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Build full conversation with system prompt
  const conversation = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    })),
  ];

  try {
    if (NVIDIA_API_KEY) {
      const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "z-ai/glm-5.1",
          messages: conversation,
          temperature: 1,
          top_p: 1,
          max_tokens: 16384,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (nvRes.ok) {
        const data = await nvRes.json() as any;
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return res.json({ reply, source: "nvidia" });
      }
      console.warn("NVIDIA API returned", nvRes.status, "- falling back to keyword classifier");
    } else {
      console.log("No NVIDIA_API_KEY set, using keyword classifier");
    }
  } catch (err: any) {
    console.warn("NVIDIA API error:", err.message, "- falling back to keyword classifier");
  }

  // Fallback: keyword classifier
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  const text = lastUserMsg?.text?.toLowerCase() ?? "";
  const reply = text.includes("price") || text.includes("cost") || text.includes("rate") || text.includes("₹")
    ? FAQ.price
    : text.includes("book") || text.includes("schedule") || text.includes("when") || text.includes("slot") || text.includes("time")
      ? FAQ.schedule
      : text.includes("chemical") || text.includes("safe") || text.includes("chlorine") || text.includes("solution")
        ? FAQ.chemical
        : text.includes("emergency") || text.includes("leak") || text.includes("urgent") || text.includes("flood")
          ? FAQ.emergency
          : "That's beyond my scope. Let me connect you with the owner.";
  res.json({ reply, source: "keyword" });
});

// ─── Workers ─────────────────────────────────────────
app.get("/api/workers", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, name, phone FROM workers WHERE active = true ORDER BY name
  `);
  res.json(rows);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
