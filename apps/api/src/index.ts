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
