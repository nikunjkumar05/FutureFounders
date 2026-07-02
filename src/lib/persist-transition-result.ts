/**
 * Persistence helper for lifecycle transition results.
 *
 * Takes a TransitionResult from the Lifecycle Transition Engine and
 * upserts it into the customer_intelligence table.
 *
 * This is a separate function from the Transition Service because
 * persistence is an operational concern, not a transition evaluation concern.
 * The Transition Service performs no persistence.
 *
 * Callers are responsible for:
 *   1. Invoking the Transition Service (evaluateTransitionForCustomer).
 *   2. Calling this function with the returned TransitionResult.
 *   3. Performing any additional side effects (cache invalidation,
 *      analytics, notifications, etc.).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransitionResult } from './lifecycle-transition-engine';
import type { LifecycleState } from './customer-attention-pipeline';
import type { CustomerSegment } from './types';

/**
 * Persist a transition result to the customer_intelligence table.
 *
 * Maps the engine's TransitionResult to the customer_intelligence schema:
 *   - lifecycleState → segment
 *   - estimatedRevenue → estimated_revenue
 *   - customerId → customer_id
 *   - merchantId → merchant_id
 *
 * @param supabase - Authenticated Supabase client with write access
 *   to customer_intelligence.
 * @param result - The TransitionResult from the engine.
 */
export async function persistTransitionResult(
  supabase: SupabaseClient,
  result: TransitionResult,
): Promise<void> {
  const segment = mapLifecycleStateToSegment(result.lifecycleState);

  const { error } = await supabase
    .from('customer_intelligence')
    .upsert({
      merchant_id: result.merchantId,
      customer_id: result.customerId,
      segment,
      estimated_revenue: result.estimatedRevenue,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'merchant_id, customer_id' });

  if (error) {
    console.error(
      `[persistTransitionResult] Failed to persist CI for customer ${result.customerId}:`,
      error,
    );
  }
}

/**
 * Map the engine's LifecycleState to the CustomerSegment stored in DB.
 *
 * LifecycleState is a subset of CustomerSegment — every valid lifecycle
 * state maps directly to the same-named segment. 'unknown' is never
 * produced by the engine, so it is not handled here.
 */
function mapLifecycleStateToSegment(state: LifecycleState): CustomerSegment {
  return state as CustomerSegment;
}
