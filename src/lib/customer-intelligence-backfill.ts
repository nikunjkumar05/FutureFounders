import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshCustomerIntelligence } from './customer-intelligence-sync';

export interface BackfillResult {
  totalCustomers: number;
  processed: number;
  errors: number;
  errorDetails: Array<{ customerId: string; name: string; error: string }>;
  durationMs: number;
}

/**
 * Rebuild the Customer Intelligence cache for every customer.
 *
 * Iterates the `customers` table in configurable batches and calls
 * `refreshCustomerIntelligence()` for each one.  Customers without
 * service cards are silently skipped by the sync pipeline.
 *
 * Safe to execute repeatedly — the underlying upsert is idempotent.
 */
export async function backfillCustomerIntelligence(
  supabase: SupabaseClient,
  merchantId: string,
  batchSize = 50,
): Promise<BackfillResult> {
  const start = performance.now();

  const result: BackfillResult = {
    totalCustomers: 0,
    processed: 0,
    errors: 0,
    errorDetails: [],
    durationMs: 0,
  };

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Backfill] Failed to fetch customers:', error);
    result.durationMs = performance.now() - start;
    return result;
  }

  if (!customers || customers.length === 0) {
    result.durationMs = performance.now() - start;
    return result;
  }

  result.totalCustomers = customers.length;
  console.log(`[Backfill] Processing ${customers.length} customers…`);

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(c => refreshCustomerIntelligence(supabase, merchantId, c.id)),
    );

    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      const customer = batch[j];
      if (s.status === 'fulfilled') {
        result.processed++;
      } else {
        result.errors++;
        result.errorDetails.push({
          customerId: customer.id,
          name: customer.name ?? 'unknown',
          error: s.reason?.message ?? String(s.reason),
        });
        console.error(`[Backfill] Error: ${customer.name} (${customer.id}):`, s.reason);
      }
    }

    console.log(
      `[Backfill] Progress: ${Math.min(i + batchSize, customers.length)}/${customers.length} (${result.errors} errors)`,
    );
  }

  result.durationMs = performance.now() - start;
  console.log(
    `[Backfill] Complete — ${result.processed} processed, ${result.errors} errors in ${(result.durationMs / 1000).toFixed(1)}s`,
  );

  return result;
}
