// Self-contained transition pipeline for api/ (no src/ imports)
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ServiceCardWithDetails,
  ReminderResponse,
  CustomerSegment,
} from './customer-attention-pipeline';
import {
  evaluateCustomerAttention,
  type CustomerAttentionInput,
  type CustomerAttentionResult,
  type LifecycleState,
  type AttentionState,
  type RequiredAction,
  type ReminderState,
  buildLatestCompletedByCustomer,
} from './customer-attention-pipeline';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LifecycleEventType =
  | 'job_created'
  | 'job_completed'
  | 'job_deleted'
  | 'reminder_sent'
  | 'reminder_responded'
  | 'reminder_booked'
  | 'reminder_ignored'
  | 'temporal_evaluation';

export type TransitionType =
  | 'lifecycle_start'
  | 'cycle_completion'
  | 'cycle_reset'
  | 'active_job_override'
  | 'active_job_removed'
  | 'reminder_transition'
  | 'temporal';

export interface TransitionInput {
  event: {
    type: LifecycleEventType;
    timestamp?: string;
  };
  serviceCards: ServiceCardWithDetails[];
  reminders: ReminderResponse[];
  customerId: string;
  merchantId: string;
  today?: Date;
  previousLifecycleState?: LifecycleState | null;
}

export interface TransitionResult {
  customerId: string;
  merchantId: string;
  previousLifecycleState: LifecycleState | null;
  lifecycleState: LifecycleState;
  transitionType: TransitionType;
  lifecycleAnchorId: string;
  lifecycleAnchorDate: string;
  nextServiceDate: string | null;
  didAnchorChange: boolean;
  reminderState: ReminderState;
  didReminderStateChange: boolean;
  attentionState: AttentionState;
  requiredAction: RequiredAction;
  reminderEligible: boolean;
  daysOverdue: number;
  healthScore: number;
  estimatedRevenue: number;
  reason: string;
  changeDescription: string;
}

// ─── Transition Service Types ───────────────────────────────────────────────

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

// ─── Lifecycle Transition Engine ────────────────────────────────────────────

function determineTransitionType(
  eventType: LifecycleEventType,
  previousState: LifecycleState | null,
  _currentState: LifecycleState,
  previousAnchorId: string | null,
  currentAnchorId: string,
): TransitionType {
  switch (eventType) {
    case 'job_created':
    case 'reminder_booked':
      return 'active_job_override';

    case 'job_completed': {
      if (previousState === null) {
        return 'lifecycle_start';
      }
      if (previousAnchorId !== null && previousAnchorId !== currentAnchorId) {
        return 'cycle_reset';
      }
      return 'cycle_completion';
    }

    case 'job_deleted':
      return 'active_job_removed';

    case 'reminder_sent':
    case 'reminder_responded':
    case 'reminder_ignored':
      return 'reminder_transition';

    case 'temporal_evaluation':
      return 'temporal';
  }
}

function buildChangeDescription(
  transitionType: TransitionType,
  previousState: LifecycleState | null,
  currentState: LifecycleState,
  didReminderStateChange: boolean,
): string {
  if (previousState === null) {
    return `First lifecycle evaluation: customer is now '${currentState}'.`;
  }

  if (transitionType === 'active_job_override') {
    return `Active job created: lifecycle overridden from '${previousState}' to '${currentState}'.`;
  }
  if (transitionType === 'active_job_removed') {
    return `Active job removed: lifecycle returned from '${previousState}' to '${currentState}'.`;
  }
  if (transitionType === 'cycle_completion') {
    return `Job completed: cycle completed, transitioning from '${previousState}' to '${currentState}'.`;
  }
  if (transitionType === 'cycle_reset') {
    return `Newer completed service found: lifecycle anchor reset, transitioning from '${previousState}' to '${currentState}'.`;
  }
  if (transitionType === 'reminder_transition') {
    if (didReminderStateChange) {
      return `Reminder state changed: transitioning from '${previousState}' to '${currentState}'.`;
    }
    return `Reminder event processed: lifecycle remains '${currentState}'.`;
  }
  if (transitionType === 'temporal') {
    if (previousState !== currentState) {
      return `Time-based transition: '${previousState}' → '${currentState}'.`;
    }
    return `Temporal evaluation: lifecycle remains '${currentState}'. No state change.`;
  }

  return `Transition '${transitionType}': '${previousState}' → '${currentState}'.`;
}

export function evaluateTransition(input: TransitionInput): TransitionResult {
  const {
    event,
    serviceCards,
    reminders,
    customerId,
    merchantId,
    today: todayArg,
    previousLifecycleState,
  } = input;

  const today = todayArg ?? new Date();

  const pipelineInput: CustomerAttentionInput = {
    serviceCards,
    reminders,
    customerId,
    merchantId,
    today,
  };

  const current: CustomerAttentionResult = evaluateCustomerAttention(pipelineInput);

  let previousAnchorId: string | null = null;

  switch (event.type) {
    case 'job_completed': {
      const allCompleted = serviceCards.filter(c => c.job_status === 'completed');
      const latestAnchor = buildLatestCompletedByCustomer(serviceCards).get(customerId);
      if (latestAnchor && allCompleted.length > 1) {
        const sortedCompleted = allCompleted
          .filter(c => c.id !== latestAnchor.id)
          .sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());
        if (sortedCompleted.length > 0) {
          previousAnchorId = sortedCompleted[0].id;
        }
      }
      break;
    }
    case 'reminder_booked': {
      previousAnchorId = current.lifecycleAnchorId;
      break;
    }
    default: {
      previousAnchorId = current.lifecycleAnchorId;
      break;
    }
  }

  const prevState: LifecycleState | null = previousLifecycleState ?? null;
  const transitionType = determineTransitionType(
    event.type,
    prevState,
    current.lifecycleState,
    previousAnchorId,
    current.lifecycleAnchorId,
  );

  const didAnchorChange = previousAnchorId !== null
    && previousAnchorId !== current.lifecycleAnchorId;

  const reminderEventTypes: LifecycleEventType[] = [
    'reminder_sent', 'reminder_responded', 'reminder_booked', 'reminder_ignored',
  ];
  const didReminderStateChange = reminderEventTypes.includes(event.type);

  const changeDescription = buildChangeDescription(
    transitionType,
    prevState,
    current.lifecycleState,
    didReminderStateChange,
  );

  return {
    customerId: current.customerId,
    merchantId: current.merchantId,
    previousLifecycleState: prevState,
    lifecycleState: current.lifecycleState,
    transitionType,
    lifecycleAnchorId: current.lifecycleAnchorId,
    lifecycleAnchorDate: current.lifecycleAnchorDate,
    nextServiceDate: current.nextServiceDate,
    didAnchorChange,
    reminderState: current.reminderState,
    didReminderStateChange,
    attentionState: current.attentionState,
    requiredAction: current.requiredAction,
    reminderEligible: current.reminderEligible,
    daysOverdue: current.daysOverdue,
    healthScore: current.healthScore,
    estimatedRevenue: current.estimatedRevenue,
    reason: current.reason,
    changeDescription,
  };
}

// ─── Transition Service ─────────────────────────────────────────────────────

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

// ─── Persist Transition Result ──────────────────────────────────────────────

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
