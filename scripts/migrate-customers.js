import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import Papa from 'papaparse';
import cliProgress from 'cli-progress';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const supabase = createClient(supabaseUrl, supabaseKey);
const skippedLog = resolve(__dirname, '..', 'migration-skipped-rows.log');

function validatePhone(phone) {
  const cleaned = phone.replace(/\s|-/g, '');
  return /^[6-9]\d{9}$/.test(cleaned) ? cleaned : null;
}

async function upsertCustomer(row) {
  const phone = validatePhone(row.phone);
  if (!phone) return { skipped: true, reason: `Invalid phone: "${row.phone}"` };

  const name = (row.name || '').trim();
  if (!name) return { skipped: true, reason: 'Missing name' };

  const address = (row.address || '').trim() || null;
  const notes = (row.notes || '').trim() || null;
  const lastServiceDate = row.last_service_date || new Date().toISOString().slice(0, 10);
  const nextServiceDate = new Date(new Date(lastServiceDate).getTime() + 180 * 86400000)
    .toISOString()
    .slice(0, 10);

  // Upsert customer on phone
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  let customerId;
  if (existing) {
    customerId = existing.id;
    await supabase
      .from('customers')
      .update({ name, address, notes })
      .eq('id', customerId);
  } else {
    const { data: newCust } = await supabase
      .from('customers')
      .insert({
        merchant_id: MERCHANT_ID,
        name,
        phone,
        address,
        notes,
      })
      .select('id')
      .single();
    customerId = newCust.id;
  }

  // Insert service card
  await supabase.from('service_cards').insert({
    customer_id: customerId,
    merchant_id: MERCHANT_ID,
    service_type: 'standard_cleaning',
    service_details: { tankCount: 1, tankCapacity: 1000, totalCapacity: 1000 },
    service_date: lastServiceDate,
    next_service_date: nextServiceDate,
    notes: 'Imported via migration',
  });

  return { skipped: false, customerId };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/migrate-customers.js <path-to-csv>');
    console.error('Example: node scripts/migrate-customers.js scripts/sample-customers.csv');
    process.exit(1);
  }

  const fullPath = resolve(process.cwd(), csvPath);
  if (!existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const csvContent = readFileSync(fullPath, 'utf-8');
  const { data: rows } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

  if (rows.length === 0) {
    console.log('CSV is empty.');
    process.exit(0);
  }

  const skipped = [];
  const bar = new cliProgress.SingleBar({
    format: 'Migrating |{bar}| {percentage}% | {value}/{total} rows',
    barCompleteChar: '=',
    barIncompleteChar: '-',
  });
  bar.start(rows.length, 0);

  for (let i = 0; i < rows.length; i++) {
    const result = await upsertCustomer(rows[i]);
    if (result.skipped) {
      skipped.push({ row: i + 1, ...result });
    }
    bar.increment();
  }

  bar.stop();

  if (skipped.length > 0) {
    const logContent = skipped.map(s => `Row ${s.row}: ${s.reason}`).join('\n');
    writeFileSync(skippedLog, logContent + '\n');
    console.log(`\nSkipped ${skipped.length} rows. Details written to migration-skipped-rows.log`);
  }

  const migrated = rows.length - skipped.length;
  console.log(`\nMigrated ${migrated} customers, skipped ${skipped.length} rows`);
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
