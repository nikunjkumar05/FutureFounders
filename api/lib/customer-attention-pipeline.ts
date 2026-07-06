// Self-contained customer attention pipeline for api/ (no src/ imports)
import type {
  ServiceCardWithDetails,
  ReminderResponse,
} from './types';
import {
  customerHasActiveJob,
  buildLatestCompletedByCustomer,
  findLatestReminder,
  deriveCustomerIntelligence,
  isCardDueThisMonth,
} from './customer-intelligence';

export type LifecycleState =
  | 'scheduled'
  | 'not_due'
  | 'ready_to_book'
  | 'follow_up_needed'
  | 'high_churn_risk';

export type AttentionState = 'attention_needed' | 'no_attention_needed';

export type RequiredAction = 'send_reminder' | 'follow_up' | 'recover' | 'none';

export type ReminderState = 'not_sent' | 'awaiting_response' | 'responded' | 'booked' | 'ignored';

export interface CustomerAttentionInput {
  serviceCards: ServiceCardWithDetails[];
  reminders: ReminderResponse[];
  customerId: string;
  merchantId: string;
  today?: Date;
}

export interface CustomerAttentionResult {
  customerId: string;
  merchantId: string;
  customerName: string;
  customerPhone: string;
  lifecycleState: LifecycleState;
  lifecycleAnchorId: string;
  lifecycleAnchorDate: string;
  nextServiceDate: string | null;
  attentionState: AttentionState;
  requiredAction: RequiredAction;
  reminderEligible: boolean;
  reminderState: ReminderState;
  daysOverdue: number;
  healthScore: number;
  estimatedRevenue: number;
  reason: string;
}

function buildAttentionState(state: LifecycleState): AttentionState {
  if (state === 'ready_to_book' || state === 'follow_up_needed' || state === 'high_churn_risk') {
    return 'attention_needed';
  }
  return 'no_attention_needed';
}

function buildRequiredAction(state: LifecycleState): RequiredAction {
  switch (state) {
    case 'ready_to_book':       return 'send_reminder';
    case 'follow_up_needed':    return 'follow_up';
    case 'high_churn_risk':     return 'recover';
    case 'scheduled':           return 'none';
    case 'not_due':             return 'none';
  }
}

function buildReminderState(reminder: ReminderResponse | null | undefined): ReminderState {
  if (!reminder) return 'not_sent';
  switch (reminder.status) {
    case 'sent':       return 'awaiting_response';
    case 'responded':  return 'responded';
    case 'booked':     return 'booked';
    case 'ignored':    return 'ignored';
    default:           return 'not_sent';
  }
}

function buildReason(
  state: LifecycleState,
  daysOverdue: number,
  _reminder: ReminderResponse | null | undefined,
  hasActiveJob: boolean,
): string {
  if (hasActiveJob) {
    return 'Customer has an active job in progress.';
  }

  switch (state) {
    case 'not_due':
      return `Next service date is in the future. No action required.`;
    case 'ready_to_book':
      if (daysOverdue > 0) {
        return `Service overdue by ${daysOverdue} day(s). No reminder sent yet. Ready to book.`;
      }
      return 'Service is due. No reminder sent yet. Ready to book.';
    case 'follow_up_needed':
      return `Reminder sent less than 10 days ago. Awaiting customer response. Follow up if no reply.`;
    case 'high_churn_risk':
      return `Reminder sent 10 or more days ago with no booking. Customer is at high risk of churn.`;
    default:
      return '';
  }
}

export function evaluateCustomerAttention(
  input: CustomerAttentionInput,
): CustomerAttentionResult {
  const {
    serviceCards,
    reminders,
    customerId,
    merchantId,
    today: todayArg,
  } = input;

  const today = todayArg ?? new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [year, month] = todayStr.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;

  const hasActiveJob = customerHasActiveJob(serviceCards, customerId);

  const latestCompletedMap = buildLatestCompletedByCustomer(serviceCards);
  const anchor = latestCompletedMap.get(customerId)
    ?? serviceCards.find(c => c.customer_id === customerId);

  if (!anchor) {
    throw new Error(
      `No service cards found for customer ${customerId}. Cannot evaluate attention.`,
    );
  }

  const latestCompletedCard = anchor.job_status === 'completed' ? anchor : null;
  const latestReminder = findLatestReminder(reminders, anchor.id);

  const derived = deriveCustomerIntelligence({
    card: anchor,
    latestCompletedCard,
    latestReminder,
    storedSegment: 'unknown',
    today,
    todayStr,
    isDueThisMonth: isCardDueThisMonth(anchor, monthStart, monthEnd),
    hasActiveJob,
  });

  const lifecycleState = derived.status as LifecycleState;
  const attentionState = buildAttentionState(lifecycleState);
  const requiredAction = buildRequiredAction(lifecycleState);
  const reminderEligible = lifecycleState === 'ready_to_book';
  const reminderState = buildReminderState(latestReminder);
  const reason = buildReason(lifecycleState, derived.daysOverdue, latestReminder, hasActiveJob);

  return {
    customerId,
    merchantId,
    customerName: derived.name,
    customerPhone: derived.phone,
    lifecycleState,
    lifecycleAnchorId: anchor.id,
    lifecycleAnchorDate: anchor.service_date,
    nextServiceDate: anchor.next_service_date,
    attentionState,
    requiredAction,
    reminderEligible,
    reminderState,
    daysOverdue: derived.daysOverdue,
    healthScore: derived.healthScore,
    estimatedRevenue: derived.expectedValue,
    reason,
  };
}

export function evaluateCustomerAttentionBatch(
  input: Omit<CustomerAttentionInput, 'customerId'>,
  customerIds?: string[],
): Map<string, CustomerAttentionResult> {
  const ids = customerIds
    ?? [...new Set(input.serviceCards.map(c => c.customer_id))];

  const results = new Map<string, CustomerAttentionResult>();

  for (const customerId of ids) {
    const result = evaluateCustomerAttention({
      ...input,
      customerId,
    });
    results.set(customerId, result);
  }

  return results;
}
