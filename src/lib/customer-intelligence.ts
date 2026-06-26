import type {
  ServiceCardWithDetails,
  ReminderResponse,
  CustomerSegment,
  SegmentedCustomer,
} from './types';
import { SERVICE_TYPE_LABELS } from './types';

/**
 * Estimate the service value of a service card based on its details.
 */
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

/**
 * Calculate the number of days a customer is overdue based on their next service date.
 */
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

/**
 * Compute a health score for a customer (0-100) based on overdue days,
 * reminder status, and tank capacity.
 */
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

/**
 * Classify a customer into a final segment based on stored segment,
 * reminder status, and overdue context.
 *
 * Two classification rule sets exist depending on whether the customer
 * was identified as "due this month" (dueThisMonth context) or only
 * appears in the overdue list.
 */
function classifySegment(
  storedSegment: CustomerSegment,
  reminder: ReminderResponse | null | undefined,
  daysOverdue: number,
  isDueThisMonth: boolean,
): 'ready_to_book' | 'follow_up_needed' | 'high_churn_risk' {
  if (isDueThisMonth) {
    if (
      storedSegment === 'ready_to_book' ||
      reminder?.status === 'responded' ||
      reminder?.status === 'booked'
    ) {
      return 'ready_to_book';
    }
    if (
      storedSegment === 'high_churn_risk' ||
      daysOverdue > 30 ||
      reminder?.status === 'ignored'
    ) {
      return 'high_churn_risk';
    }
    if (reminder?.status === 'sent' || daysOverdue > 0) {
      return 'follow_up_needed';
    }
    if (reminder) {
      return 'follow_up_needed';
    }
    return 'ready_to_book';
  }

  if (
    storedSegment === 'high_churn_risk' ||
    daysOverdue > 30 ||
    reminder?.status === 'ignored'
  ) {
    return 'high_churn_risk';
  }
  if (
    storedSegment === 'ready_to_book' ||
    reminder?.status === 'responded' ||
    reminder?.status === 'booked'
  ) {
    return 'ready_to_book';
  }
  return 'follow_up_needed';
}

/**
 * Extract the tank capacity from service card details for health score
 * computation.
 */
function extractCapacity(card: ServiceCardWithDetails): number {
  const details = (card.service_details || {}) as Record<string, unknown>;
  return (details.tankCapacity || details.totalCapacity || 1000) as number;
}

/**
 * Derive customer intelligence for a single customer.
 *
 * Accepts raw data for one customer and returns derived intelligence:
 * segment classification, days overdue, health score, estimated revenue,
 * and the full SegmentedCustomer object.
 *
 * This is a pure function with no side effects, database queries, or
 * React hooks. Given the same inputs it always returns the same output.
 */
export function deriveCustomerIntelligence({
  card,
  latestCompletedCard,
  latestReminder,
  storedSegment,
  today,
  todayStr,
  isDueThisMonth,
}: {
  card: ServiceCardWithDetails;
  latestCompletedCard: ServiceCardWithDetails | null;
  latestReminder: ReminderResponse | null;
  storedSegment: CustomerSegment;
  today: Date;
  todayStr: string;
  isDueThisMonth: boolean;
}): SegmentedCustomer {
  const expectedValue = latestCompletedCard
    ? estimateServiceValue(latestCompletedCard)
    : estimateServiceValue(card);

  const daysOverdue = calcDaysOverdue(card.next_service_date, today, todayStr);

  const capacity = extractCapacity(card);
  const healthScore = calcHealthScore(daysOverdue, latestReminder, capacity);

  const status = classifySegment(storedSegment, latestReminder, daysOverdue, isDueThisMonth);

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
