import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ─── Environment Check ───────────────────────────────
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    throw new Error(`Missing required environment variable: ${k}`);
  }
}

// ─── Express App ─────────────────────────────────────
const app = express();

// ─── Security Middleware ─────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:5173",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
}));

app.use(express.json({ limit: "10kb" }));

// ─── Rate Limiting ──────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many chat requests, please try again later." },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: "Too many webhook requests." },
});

// ─── Supabase Client ─────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey!, {
  auth: { persistSession: false },
});

// ─── Auth Middleware ─────────────────────────────────
function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "");
  if (!key || key !== process.env.API_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    (req as any).user = data.user;
    next();
  });
}

// ─── Auth Routes ─────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const RegisterSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6).max(100),
      name: z.string().min(1).max(100),
      role: z.enum(["customer", "provider"]),
    });
    const { email, password, name, role } = RegisterSchema.parse(req.body);

    const { data: userData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (signUpError) throw signUpError;
    if (!userData.user) throw new Error("User creation failed");

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userData.user.id,
      email,
      name,
      role,
    });
    if (profileError) throw profileError;

    res.status(201).json({ id: userData.user.id, email, name, role });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    if (err.message?.includes("already registered") || err.message?.includes("already exists")) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    console.error("POST /api/auth/register error:", err.message, err.cause);
    res.status(500).json({ error: "Registration failed", detail: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const LoginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const { email, password } = LoginSchema.parse(req.body);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", data.user.id)
      .single();

    res.json({
      token: data.session.access_token,
      user: profile || { id: data.user.id, email, name: "", role: "customer" },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    if (err.message?.includes("Invalid login credentials")) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    console.error("POST /api/auth/login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    res.json(profile);
  } catch (err: any) {
    console.error("GET /api/auth/me error:", err.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── Validation Schemas ──────────────────────────────
const IdParamSchema = z.object({ id: z.string().uuid() });
const AttendanceCheckinSchema = z.object({
  worker_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

// ─── Jobs ────────────────────────────────────────────
app.get("/api/jobs", async (_req, res, _next) => {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select(`id, status, scheduled_date, completed_at, site_lat, site_lng,
        customer:customers(name, phone), worker:workers(name)`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data.map((j: any) => ({
      id: j.id,
      status: j.status,
      scheduled_date: j.scheduled_date,
      completed_at: j.completed_at,
      site_lat: j.site_lat,
      site_lng: j.site_lng,
      customer: (j.customer as any)?.name,
      customer_phone: (j.customer as any)?.phone,
      worker: (j.worker as any)?.name,
    })));
  } catch (err: any) {
    console.error("GET /api/jobs error:", err.message);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

app.post("/api/jobs/:id/complete", async (req, res) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { data, error } = await supabase
      .from("jobs")
      .update({ status: "completed" })
      .eq("id", id)
      .neq("status", "completed")
      .select("id, status, completed_at")
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(404).json({ error: "Job not found or already completed" });
  }
});

// ─── Inventory ───────────────────────────────────────
app.get("/api/inventory", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("inventory")
      .select("id, name, quantity, unit, min_threshold")
      .order("name");
    if (error) throw error;
    res.json(data.map((i: any) => ({
      id: i.id,
      name: i.name,
      quantity: String(i.quantity),
      unit: i.unit,
      min_threshold: String(i.min_threshold),
      low_stock: i.quantity < i.min_threshold,
    })));
  } catch (err: any) {
    console.error("GET /api/inventory error:", err.message);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

// ─── Metrics ────────────────────────────────────────
app.get("/api/metrics", async (_req, res) => {
  try {
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
  } catch (err: any) {
    console.error("GET /api/metrics error:", err.message);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// ─── Reminders ───────────────────────────────────────
app.get("/api/reminders", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("service_reminders")
      .select(`id, due_date, status, sent_at,
        customer:customers(name, phone, address)`)
      .order("due_date", { ascending: true });
    if (error) throw error;
    res.json(data.map((r: any) => {
      const c = r.customer as any;
      return { id: r.id, due_date: r.due_date, status: r.status, sent_at: r.sent_at,
        customer: c?.name, phone: c?.phone, address: c?.address };
    }));
  } catch (err: any) {
    console.error("GET /api/reminders error:", err.message);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

app.post("/api/reminders/:id/send", async (req, res) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { data, error } = await supabase
      .from("service_reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, status, sent_at")
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(404).json({ error: "Reminder not found or already sent" });
  }
});

// ─── Attendance ──────────────────────────────────────
app.get("/api/attendance", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: workers, error } = await supabase
      .from("workers")
      .select("id, name, phone")
      .eq("active", true)
      .order("name");
    if (error) throw error;

    const result = await Promise.all(workers.map(async (w: any) => {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, status, site_lat, site_lng, customer:customers(name)")
        .eq("worker_id", w.id)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: checkins } = await supabase
        .from("check_ins")
        .select("status, distance_meters, received_at")
        .eq("worker_id", w.id)
        .gte("received_at", today)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        id: w.id,
        name: w.name,
        phone: w.phone,
        job_id: jobs?.id || null,
        job_status: jobs?.status || null,
        site_lat: jobs?.site_lat || null,
        site_lng: jobs?.site_lng || null,
        customer: (jobs?.customer as any)?.name || null,
        check_in_status: checkins?.status || null,
        distance_meters: checkins?.distance_meters ? String(checkins.distance_meters) : null,
        checked_in_at: checkins?.received_at || null,
      };
    }));
    res.json(result);
  } catch (err: any) {
    console.error("GET /api/attendance error:", err.message);
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

app.post("/api/attendance/checkin", async (req, res) => {
  try {
    const body = AttendanceCheckinSchema.parse(req.body);
    const { data, error } = await supabase
      .from("check_ins")
      .insert({
        job_id: body.job_id || null,
        worker_id: body.worker_id,
        status: "on_time",
        reported_lat: body.lat || null,
        reported_lng: body.lng || null,
      })
      .select("id, status, distance_meters, received_at")
      .single();
    if (error) throw error;
    res.status(201).json({
      id: data.id,
      status: data.status,
      distance_meters: data.distance_meters ? String(data.distance_meters) : null,
      received_at: data.received_at,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("POST /api/attendance/checkin error:", err.message);
    res.status(500).json({ error: "Failed to check in" });
  }
});

// ─── AI Chat (NVIDIA API) ────────────────────────────
const SYSTEM_PROMPT = `You are a helpful AI assistant for MakeWebApp, a services platform.

You can help users with:
1. **Services** — Information about available services, pricing, and scheduling.
2. **Account** — Help with login, registration, and profile.
3. **Support** — General inquiries about the platform.

RULES:
- Answer concisely in 1-2 sentences.
- If a question is off-topic, respond: "That's beyond my scope. Let me connect you with a human."
- Be friendly and professional.`;

const FAQ: Record<string, string> = {
  general: "I'm the MakeWebApp assistant. How can I help you today?",
  support: "For support inquiries, please reach out through the contact form or call us directly.",
};

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const ChatSchema = z.object({
      messages: z.array(z.object({
        role: z.string(),
        text: z.string().max(2000),
      })).max(20), // limit messages
    });

    const { messages } = ChatSchema.parse(req.body);

    const conversation = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; text: string }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
    ];

    if (!NVIDIA_API_KEY) {
      throw new Error("NVIDIA_API_KEY not configured");
    }

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

    // Fallback
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const text = lastUserMsg?.text?.toLowerCase() ?? "";
    const reply = text.includes("help") || text.includes("support") || text.includes("contact")
      ? FAQ.support
      : FAQ.general;
    res.json({ reply, source: "keyword" });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: err.errors });
      return;
    }
    console.error("POST /api/chat error:", err.message);
    res.status(500).json({ error: "Chat service temporarily unavailable" });
  }
});

// ─── Workers ─────────────────────────────────────────
app.get("/api/workers", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("workers")
      .select("id, name, phone")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("GET /api/workers error:", err.message);
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

// ─── WhatsApp Webhook ───────────────────────────────
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "aquaops-verify-2024";

app.get("/api/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.status(403).send("Verification failed");
});

app.post("/api/webhook/whatsapp", webhookLimiter, async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages || !Array.isArray(messages)) {
      return res.sendStatus(200);
    }

    for (const msg of messages) {
      const fromPhone = msg.from;
      const msgType = msg.type;

      if (msgType === "location") {
        const { latitude, longitude } = msg.location;
        const { data: workers } = await supabase
          .from("workers")
          .select("id, name")
          .eq("phone", fromPhone)
          .limit(1);
        const worker = workers?.[0];
        if (!worker) {
          console.warn("Unknown worker:", fromPhone);
          continue;
        }
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id")
          .eq("worker_id", worker.id)
          .neq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1);
        const job = jobs?.[0];
        const { error: checkinError } = await supabase
          .from("check_ins")
          .insert({
            job_id: job?.id || null,
            worker_id: worker.id,
            status: "on_time",
            reported_lat: latitude,
            reported_lng: longitude,
            webhook_ts: new Date(Number(msg.timestamp) * 1000).toISOString(),
          });
        if (checkinError) console.error("Check-in error:", checkinError.message);
      }
    }

    res.sendStatus(200);
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

// ─── Cron: Dispatch 180-day Reminders ───────────────
app.post("/api/cron/reminders", apiKeyAuth, async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: reminders, error } = await supabase
      .from("service_reminders")
      .select(`id, due_date, status,
        customer:customers(name, phone)`)
      .eq("status", "pending")
      .lte("due_date", today)
      .limit(10);

    if (error) throw error;
    if (!reminders?.length) return res.json({ sent: 0 });

    let sent = 0;
    for (const r of reminders) {
      const c = r.customer as any;
      const phone = c?.phone;
      if (!phone) continue;
      const { error: updateError } = await supabase
        .from("service_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "pending");
      if (!updateError) sent++;
    }

    res.json({ sent, total: reminders.length });
  } catch (err: any) {
    console.error("POST /api/cron/reminders error:", err.message);
    res.status(500).json({ error: "Failed to dispatch reminders" });
  }
});

export { app, supabase };
