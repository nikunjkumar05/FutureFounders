// Self-contained customer attention pipeline for api/ (no src/ imports)

// ─── Types ───────────────────────────────────────────────────────────────────
export type JobStatus = 'pending' | 'in_progress' | 'completed';

export type ServiceType =
  | 'standard_cleaning'
  | 'deep_cleaning'
  | 'sofa_cleaning'
  | 'seats_cleaning'
  | 'carpet_cleaning'
  | 'custom_service';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  standard_cleaning: 'Tank Cleaning',
  deep_cleaning: 'Deep Cleaning',
  sofa_cleaning: 'Sofa Cleaning',
  seats_cleaning: 'Seats Cleaning',
  carpet_cleaning: 'Carpet Cleaning',
  custom_service: 'Custom Service',
};

export interface Customer {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

export type WageType = 'daily' | 'weekly' | 'monthly';

export interface Staff {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  daily_wage_inr: number;
  wage_type: WageType;
  wage_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface ServiceCard {
  id: string;
  customer_id: string;
  merchant_id: string;
  service_type: ServiceType;
  service_details: Record<string, unknown>;
  service_date: string;
  next_service_date: string | null;
  job_status: JobStatus;
  technician_id: string | null;
  discount: number;
  notes: string | null;
  feedback_sent: boolean;
  feedback_rating: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  customers?: Customer;
  staff?: Staff;
}

export interface ServiceCardWithDetails extends Omit<ServiceCard, 'staff'> {
  customers: Customer;
  staff: Staff | null;
}

export type ReminderStatus = 'sent' | 'responded' | 'booked' | 'ignored';

export interface ReminderResponse {
  id: string;
  service_card_id: string;
  merchant_id: string;
  customer_id: string;
  sent_at: string;
  responded_at: string | null;
  response: string | null;
  status: ReminderStatus;
  notes: string | null;
  created_at: string;
}

export type CustomerSegment = 'not_due' | 'ready_to_book' | 'follow_up_needed' | 'high_churn_risk' | 'scheduled' | 'unknown';

export interface CustomerIntelligence {
  id: string;
  merchant_id: string;
  customer_id: string;
  segment: CustomerSegment;
  estimated_revenue: number;
  last_reminder_response: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface SegmentedCustomer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  expectedValue: number;
  serviceType: string;
  serviceTypeLabel: string;
  status: string;
  daysOverdue: number;
  lastServiceDate: string | null;
  healthScore: number;
  anchorCardId?: string;
}

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

// ─── Customer Intelligence Helpers ──────────────────────────────────────────

export function customerHasActiveJob(
  cards: ServiceCardWithDetails[],
  customerId: string,
): boolean {
  return cards.some(
    c => c.customer_id === customerId && (c.job_status === 'pending' || c.job_status === 'in_progress'),
  );
}

export function estimateServiceValue(card: ServiceCardWithDetails): number {
  const details = (card.service_details ?? {}) as Record<string, unknown>;

  if (typeof details.totalCharge === 'number') return details.totalCharge;

  if (Array.isArray(details.services)) {
    const groups = details.services as Array<{ totalPrice?: number; items?: Array<{ price?: number; quantity?: number }> }>;
    return groups.reduce((sum, g) => {
      if (g.totalPrice) return sum + g.totalPrice;
      if (g.items) {
        return sum + g.items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
      }
      return sum;
    }, 0);
  }

  const tankCapacity = (details.totalCapacity as number) || (details.tankCapacity as number) || 1000;
  const pricing: Record<string, number> = {
    standard_cleaning: 1200,
    deep_cleaning: 1800,
    sofa_cleaning: 1500,
    seats_cleaning: 1200,
    carpet_cleaning: 2000,
    custom_service: 1000,
  };
  const basePrice = pricing[card.service_type] ?? 1000;
  if (card.service_type === 'standard_cleaning' || card.service_type === 'deep_cleaning') {
    return Math.round(basePrice * (tankCapacity / 1000));
  }
  return basePrice;
}

function calcDaysOverdue(
  nextServiceDate: string | null,
  today: Date,
  todayStr: string,
): number {
  if (!nextServiceDate) return 0;
  if (nextServiceDate >= todayStr) return 0;
  return Math.floor(
    (today.getTime() - new Date(nextServiceDate + 'T00:00:00').getTime()) / 86400000,
  );
}

function extractCapacity(card: ServiceCardWithDetails): number {
  const details = (card.service_details || {}) as Record<string, unknown>;
  return (details.tankCapacity || details.totalCapacity || 1000) as number;
}

function calcHealthScore(
  daysOverdue: number,
  reminder: ReminderResponse | null | undefined,
  capacity: number,
): number {
  let score = 100;
  score -= Math.min(daysOverdue * 1.5, 60);
  if (reminder?.status === 'ignored') {
    score -= 20;
  } else if (reminder?.status === 'sent') {
    score -= 10;
  }
  if (capacity > 1000) {
    score -= 10;
  }
  return Math.max(0, Math.round(score));
}

function classifySegment(
  reminder: ReminderResponse | null | undefined,
  today: Date = new Date(),
): 'ready_to_book' | 'follow_up_needed' | 'high_churn_risk' {
  if (!reminder) {
    return 'ready_to_book';
  }

  const hoursSinceReminder =
    (today.getTime() - new Date(reminder.sent_at).getTime()) / (1000 * 60 * 60);

  if (hoursSinceReminder >= 240) {
    return 'high_churn_risk';
  }

  return 'follow_up_needed';
}

export interface CustomerIntelligenceInput {
  card: ServiceCardWithDetails;
  latestCompletedCard: ServiceCardWithDetails | null;
  latestReminder: ReminderResponse | null;
  storedSegment: CustomerSegment;
  today: Date;
  todayStr: string;
  isDueThisMonth: boolean;
  hasActiveJob?: boolean;
}

export function deriveCustomerIntelligence(
  input: CustomerIntelligenceInput,
): SegmentedCustomer {
  const { card, latestCompletedCard, latestReminder, today, todayStr, hasActiveJob } = input;

  if (hasActiveJob) {
    return {
      id: card.customer_id,
      name: card.customers?.name ?? 'Unknown',
      phone: card.customers?.phone ?? '',
      address: card.customers?.address ?? null,
      expectedValue: 0,
      serviceType: card.service_type,
      serviceTypeLabel: SERVICE_TYPE_LABELS[card.service_type] ?? card.service_type,
      status: 'scheduled',
      daysOverdue: 0,
      lastServiceDate: card.service_date,
      healthScore: 100,
    };
  }

  if (card.next_service_date && card.next_service_date > todayStr) {
    return {
      id: card.customer_id,
      name: card.customers?.name ?? 'Unknown',
      phone: card.customers?.phone ?? '',
      address: card.customers?.address ?? null,
      expectedValue: 0,
      serviceType: card.service_type,
      serviceTypeLabel: SERVICE_TYPE_LABELS[card.service_type] ?? card.service_type,
      status: 'not_due',
      daysOverdue: 0,
      lastServiceDate: card.service_date,
      healthScore: 100,
    };
  }

  const expectedValue = latestCompletedCard
    ? estimateServiceValue(latestCompletedCard)
    : estimateServiceValue(card);

  const daysOverdue = calcDaysOverdue(card.next_service_date, today, todayStr);
  const capacity = extractCapacity(card);
  const healthScore = calcHealthScore(daysOverdue, latestReminder, capacity);
  const status = classifySegment(latestReminder, today);

  return {
    id: card.customer_id,
    name: card.customers?.name ?? 'Unknown',
    phone: card.customers?.phone ?? '',
    address: card.customers?.address ?? null,
    expectedValue,
    serviceType: card.service_type,
    serviceTypeLabel: SERVICE_TYPE_LABELS[card.service_type] ?? card.service_type,
    status,
    daysOverdue,
    lastServiceDate: card.service_date,
    healthScore,
  };
}

export function findLatestReminder(
  reminders: ReminderResponse[],
  serviceCardId: string,
): ReminderResponse | null {
  let latest: ReminderResponse | null = null;
  for (const r of reminders) {
    if (r.service_card_id !== serviceCardId) continue;
    if (!latest || new Date(r.sent_at) > new Date(latest.sent_at)) {
      latest = r;
    }
  }
  return latest;
}

export function buildLatestCompletedByCustomer(
  cards: ServiceCardWithDetails[],
): Map<string, ServiceCardWithDetails> {
  const map = new Map<string, ServiceCardWithDetails>();
  for (const card of cards) {
    if (card.job_status !== 'completed') continue;
    const existing = map.get(card.customer_id);
    if (!existing || new Date(card.service_date) > new Date(existing.service_date)) {
      map.set(card.customer_id, card);
    }
  }
  return map;
}

export function findLatestCompletedCard(
  cards: ServiceCardWithDetails[],
  customerId: string,
): ServiceCardWithDetails | null {
  return buildLatestCompletedByCustomer(cards).get(customerId) ?? null;
}

export function isCardDueThisMonth(
  card: ServiceCardWithDetails,
  monthStart: string,
  monthEnd: string,
): boolean {
  if (!card.next_service_date) return false;
  return card.next_service_date >= monthStart && card.next_service_date <= monthEnd;
}

// ─── Attention Pipeline ─────────────────────────────────────────────────────

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
