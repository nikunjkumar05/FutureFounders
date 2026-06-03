import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = "https://ewiwhnojnqdqbelzxvvq.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey!, {
  auth: { persistSession: false },
});

// ─── Jobs ────────────────────────────────────────────
app.get("/api/jobs", async (_req, res) => {
  const { data, error } = await supabase
    .from("jobs")
    .select(`id, status, scheduled_date, completed_at, site_lat, site_lng,
      customer:customers(name), worker:workers(name)`)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((j: any) => ({
    id: j.id,
    status: j.status,
    scheduled_date: j.scheduled_date,
    completed_at: j.completed_at,
    site_lat: j.site_lat,
    site_lng: j.site_lng,
    customer: j.customer?.name,
    worker: j.worker?.name,
  })));
});

app.post("/api/jobs/:id/complete", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "completed" })
    .eq("id", id)
    .neq("status", "completed")
    .select("id, status, completed_at")
    .single();
  if (error) return res.status(404).json({ error: "Job not found or already completed" });
  res.json(data);
});

// ─── Inventory ───────────────────────────────────────
app.get("/api/inventory", async (_req, res) => {
  const { data, error } = await supabase
    .from("inventory")
    .select("id, name, quantity, unit, min_threshold")
    .order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((i: any) => ({
    id: i.id,
    name: i.name,
    quantity: String(i.quantity),
    unit: i.unit,
    min_threshold: String(i.min_threshold),
    low_stock: i.quantity < i.min_threshold,
  })));
});

// ─── Metrics ────────────────────────────────────────
app.get("/api/metrics", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [completed, allInventory, reminders] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true })
      .eq("status", "completed").gte("completed_at", today),
    supabase.from("inventory").select("quantity, min_threshold"),
    supabase.from("service_reminders").select("id", { count: "exact", head: true })
      .eq("status", "pending").lte("due_date", weekFromNow),
  ]);

  const lowStockCount = allInventory.data?.filter((i: any) => i.quantity < i.min_threshold).length ?? 0;

  res.json({
    completed_today: completed.count,
    low_stock_count: lowStockCount,
    reminders_due_soon: reminders.count,
  });
});

// ─── Reminders ───────────────────────────────────────
app.get("/api/reminders", async (_req, res) => {
  const { data, error } = await supabase
    .from("service_reminders")
    .select(`id, due_date, status, sent_at,
      customer:customers(name, phone, address)`)
    .order("due_date", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((r: any) => ({
    id: r.id,
    due_date: r.due_date,
    status: r.status,
    sent_at: r.sent_at,
    customer: r.customer?.name,
    phone: r.customer?.phone,
    address: r.customer?.address,
  })));
});

app.post("/api/reminders/:id/send", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("service_reminders")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, status, sent_at")
    .single();
  if (error) return res.status(404).json({ error: "Reminder not found or already sent" });
  res.json(data);
});

// ─── Attendance ──────────────────────────────────────
app.get("/api/attendance", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data: workers, error } = await supabase
    .from("workers")
    .select("id, name, phone")
    .eq("active", true)
    .order("name");
  if (error) return res.status(500).json({ error: error.message });

  const result = await Promise.all(workers.map(async (w: any) => {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, status, site_lat, site_lng, customer:customers(name)")
      .eq("worker_id", w.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const { data: checkins } = await supabase
      .from("check_ins")
      .select("status, distance_meters, received_at")
      .eq("worker_id", w.id)
      .gte("received_at", today)
      .order("received_at", { ascending: false })
      .limit(1)
      .single();
    return {
      id: w.id,
      name: w.name,
      phone: w.phone,
      job_id: jobs?.id || null,
      job_status: jobs?.status || null,
      site_lat: jobs?.site_lat || null,
      site_lng: jobs?.site_lng || null,
      customer: jobs?.customer?.name || null,
      check_in_status: checkins?.status || null,
      distance_meters: checkins?.distance_meters ? String(checkins.distance_meters) : null,
      checked_in_at: checkins?.received_at || null,
    };
  }));
  res.json(result);
});

app.post("/api/attendance/checkin", async (req, res) => {
  const { worker_id, job_id, lat, lng } = req.body;
  if (!worker_id) return res.status(400).json({ error: "worker_id required" });
  const { data, error } = await supabase
    .from("check_ins")
    .insert({ job_id: job_id || null, worker_id, status: "on_time", reported_lat: lat || null, reported_lng: lng || null })
    .select("id, status, distance_meters, received_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({
    id: data.id,
    status: data.status,
    distance_meters: data.distance_meters ? String(data.distance_meters) : null,
    received_at: data.received_at,
  });
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
          max_tokens: 512,
          stream: false,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (nvRes.ok) {
        const data = await nvRes.json() as any;
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return res.json({ reply, source: "nvidia" });
      }
      console.warn("NVIDIA API returned", nvRes.status, "- falling back to keyword classifier");
    }
  } catch (err: any) {
    console.warn("NVIDIA API error:", err.message, "- falling back to keyword classifier");
  }

  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
  const text = lastUserMsg?.text?.toLowerCase() ?? "";
  const reply = text.includes("price") || text.includes("pricing") || text.includes("cost") || text.includes("rate") || text.includes("₹")
    ? FAQ.price
    : text.includes("book") || text.includes("schedule") || text.includes("when") || text.includes("slot") || text.includes("time") || text.includes("hour")
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
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, phone")
    .eq("active", true)
    .order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export { app, supabase };
