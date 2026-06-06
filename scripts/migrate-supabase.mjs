import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dns from "dns";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL environment variable is required");

// Try to resolve IPv4 address
const hostname = "db.ewiwhnojnqdqbelzxvvq.supabase.co";

function resolveHostname(host) {
  return new Promise((resolve, reject) => {
    dns.resolve4(host, (err, addresses) => {
      if (err) return reject(err);
      resolve(addresses[0]);
    });
  });
}

async function run() {
  try {
    let connectionString = rawUrl;
    try {
      const ip = await resolveHostname(hostname);
      console.log("Resolved IPv4:", ip);
      connectionString = rawUrl.replace(hostname, ip);
      console.log("Using connection to:", ip);
    } catch {
      console.log("No IPv4 record found, trying direct connection...");
    }

    const pool = new pg.Pool({ connectionString });

    // Test connection
    const { rows } = await pool.query("SELECT NOW() AS time");
    console.log("Connected to Supabase at", rows[0].time);

    // Run schema
    console.log("\n1. Running schema...");
    const schema = readFileSync(join(__dirname, "..", "supabase", "migrations", "001_schema.sql"), "utf-8");
    await pool.query(schema);
    console.log("   Schema created ✓");

    // Run triggers
    console.log("\n2. Running triggers...");
    const triggers = readFileSync(join(__dirname, "..", "supabase", "migrations", "002_inventory_trigger.sql"), "utf-8");
    await pool.query(triggers);
    console.log("   Triggers created ✓");

    // Run seed
    console.log("\n3. Running seed data...");
    const seed = readFileSync(join(__dirname, "..", "supabase", "seed.sql"), "utf-8");
    await pool.query(seed);
    console.log("   Seed data inserted ✓");

    // Verify
    const inv = await pool.query("SELECT name, quantity::text FROM inventory");
    console.log("\n4. Inventory:", JSON.stringify(inv.rows));

    console.log("\n✅ Supabase setup complete!");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    // pool will auto-close
  }
}

run();
