// Self-contained transition service for api/ (no src/ imports)
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceCardWithDetails,
  ReminderResponse,
  CustomerSegment,
} from './types';
import type { LifecycleState } from './customer-attention-pipeline';
import {
  evaluateTransition,
  type LifecycleEventType,
  type TransitionResult,
} from './lifecycle-transition-engine';

export interface TransitionServiceRequest {
  merchantId: string;
  customerId: string;
  event: {
    type: LifecycleEventType;
    timestamp?: string;
  };
}

export interface TransitionServiceOptions {
  serviceCards?: ServiceCardWithDetails[];
  reminders?: ReminderResponse[];
  previousLifecycleState?: LifecycleState | null;
  today?: Date;
}

export type { LifecycleEventType, TransitionResult } from './lifecycle-transition-engine';
export type { LifecycleState } from './customer-attention-pipeline';

function segmentToLifecycleState(segment: CustomerSegment): LifecycleState | null {
  if (segment === 'unknown') return null;
  return segment as LifecycleState;
}

async function resolvePreviousLifecycleState(
  supabase: SupabaseClient,
  merchantId: string,
  customerId: string,
): Promise<LifecycleState | null> {
  try {
    const { data, error } = await supabase
      .from('customer_intelligence')
      .select('segment')
      .eq('merchant_id', merchantId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error || !data) return null;
    return segmentToLifecycleState(data.segment as CustomerSegment);
  } catch (err) {
    console.error('[resolvePreviousLifecycleState] Failed to resolve previous state:', err);
    return null;
  }
}

export async function evaluateTransitionForCustomer(
  supabase: SupabaseClient,
  request: TransitionServiceRequest,
  options?: TransitionServiceOptions,
): Promise<TransitionResult> {
  const { merchantId, customerId, event } = request;
  const today = options?.today;

  const [serviceCards, reminders, previousLifecycleState] = await Promise.all([
    options?.serviceCards !== undefined
      ? Promise.resolve(options.serviceCards)
      : resolveServiceCards(supabase, merchantId, customerId),
    options?.reminders !== undefined
      ? Promise.resolve(options.reminders)
      : resolveReminders(supabase, merchantId, customerId),
    options?.previousLifecycleState !== undefined
      ? Promise.resolve(options.previousLifecycleState)
      : resolvePreviousLifecycleState(supabase, merchantId, customerId),
  ]);

  return evaluateTransition({
    event,
    serviceCards,
    reminders,
    customerId,
    merchantId,
    today,
    previousLifecycleState,
  });
}

async function resolveServiceCards(
  supabase: SupabaseClient,
  merchantId: string,
  customerId: string,
): Promise<ServiceCardWithDetails[]> {
  const { data, error } = await supabase
    .from('service_cards')
    .select('*, customers(*)')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId)
    .order('service_date', { ascending: false });

  if (error) {
    throw new Error(
      `Failed to resolve service cards for customer ${customerId}: ${error.message}`,
    );
  }

  return (data ?? []) as ServiceCardWithDetails[];
}

async function resolveReminders(
  supabase: SupabaseClient,
  merchantId: string,
  customerId: string,
): Promise<ReminderResponse[]> {
  const { data, error } = await supabase
    .from('reminder_responses')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(
      `Failed to resolve reminders for customer ${customerId}: ${error.message}`,
    );
  }

  return (data ?? []) as ReminderResponse[];
}
