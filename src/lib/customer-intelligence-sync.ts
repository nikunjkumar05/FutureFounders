import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceCardWithDetails,
  ReminderResponse,
  CustomerIntelligence,
  CustomerSegment,
} from './types';
import { buildCustomerContext, deriveCustomerIntelligence } from './customer-intelligence';

/**
 * Recalculate customer intelligence for a single customer using the
 * shared derivation pipeline and persist the result.
 *
 * Fetches raw data for the customer, builds context using shared
 * helpers, calls deriveCustomerIntelligence(), then upserts the
 * resulting segment and estimated revenue into customer_intelligence.
 *
 * This is the single shared implementation used by both the React app
 * (via React Query mutation callbacks) and the webhook (via server-side
 * Supabase REST calls).
 */
export async function refreshCustomerIntelligence(
  supabase: SupabaseClient,
  merchantId: string,
  customerId: string,
): Promise<void> {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [cardsRes, remindersRes, ciRes] = await Promise.all([
      supabase
        .from('service_cards')
        .select('*, customers(*)')
        .eq('merchant_id', merchantId)
        .eq('customer_id', customerId)
        .order('service_date', { ascending: false }),
      supabase
        .from('reminder_responses')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_intelligence')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('customer_id', customerId)
        .maybeSingle(),
    ]);

    if (cardsRes.error) {
      console.error('Failed to fetch service cards for customer intelligence:', cardsRes.error);
      return;
    }
    if (remindersRes.error) {
      console.error('Failed to fetch reminders for customer intelligence:', remindersRes.error);
      return;
    }
    if (ciRes.error) {
      console.error('Failed to fetch customer intelligence record:', ciRes.error);
      return;
    }

    const cards = (cardsRes.data ?? []) as ServiceCardWithDetails[];
    if (cards.length === 0) return;

    const reminders = (remindersRes.data ?? []) as ReminderResponse[];
    const storedCI = ciRes.data as CustomerIntelligence | null;

    const context = buildCustomerContext(
      cards,
      reminders,
      storedCI,
      monthStart,
      monthEnd,
      customerId,
    );
    if (!context) return;

    const derived = deriveCustomerIntelligence({
      card: context.card,
      latestCompletedCard: context.latestCompletedCard,
      latestReminder: context.latestReminder,
      storedSegment: context.storedSegment,
      today,
      todayStr,
      isDueThisMonth: context.isDueThisMonth,
    });

    const { error } = await supabase
      .from('customer_intelligence')
      .upsert({
        merchant_id: merchantId,
        customer_id: customerId,
        segment: derived.status as CustomerSegment,
        estimated_revenue: derived.expectedValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'merchant_id, customer_id' });

    if (error) {
      console.error('Failed to refresh customer intelligence cache:', error);
    }
  } catch (err) {
    console.error('Failed to refresh customer intelligence cache:', err);
  }
}
