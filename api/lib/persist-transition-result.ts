// Self-contained persist transition result for api/ (no src/ imports)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransitionResult } from './lifecycle-transition-engine';
import type { LifecycleState } from './customer-attention-pipeline';
import type { CustomerSegment } from './types';

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

function mapLifecycleStateToSegment(state: LifecycleState): CustomerSegment {
  return state as CustomerSegment;
}
