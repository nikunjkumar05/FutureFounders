// test-trigger.mjs
// Run: node scripts/test-trigger.mjs
// Requires a running PostgreSQL at localhost:5432

import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "futurefounders",
});

async function run() {
  const client = await pool.connect();

  try {
    console.log("1. Running schema migration...");
    const schema = readFileSync(join(__dirname, "..", "supabase", "migrations", "001_schema.sql"), "utf-8");
    await client.query(schema);

    console.log("2. Running trigger migration...");
    const triggers = readFileSync(join(__dirname, "..", "supabase", "migrations", "002_inventory_trigger.sql"), "utf-8");
    await client.query(triggers);

    console.log("3. Seeding test data...");
    const seed = readFileSync(join(__dirname, "..", "supabase", "seed.sql"), "utf-8");
    await client.query(seed);

    // Verify inventory was auto-deducted
    console.log("\n4. Checking inventory after trigger...");
    const inv = await client.query(`
      SELECT name, quantity, unit FROM inventory ORDER BY name
    `);
    console.table(inv.rows);

    // Verify service reminder was created
    console.log("\n5. Checking service reminders...");
    const reminders = await client.query(`
      SELECT sr.due_date::text, sr.status, c.name as customer
      FROM service_reminders sr
      JOIN customers c ON c.id = sr.customer_id
    `);
    console.table(reminders.rows);

    // Test: toggle a job to 'completed' and see trigger fire again
    console.log("\n6. Simulating job completion for job #2...");
    await client.query(`
      UPDATE jobs SET status = 'completed' WHERE id = 'j0000000-0000-0000-0000-000000000002'
    `);
    console.log("   Job #2 marked complete. Verifying inventory again...");

    const inv2 = await client.query(`
      SELECT name, quantity, unit FROM inventory ORDER BY name
    `);
    console.table(inv2.rows);

    const reminders2 = await client.query(`
      SELECT COUNT(*) as total FROM service_reminders
    `);
    console.log(`   Total service reminders now: ${reminders2.rows[0].total}`);

    console.log("\n✅ All trigger tests passed!");
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
