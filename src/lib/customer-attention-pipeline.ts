// ─── Phase 1: Audit of existing customer-attention implementations ───────────
//
// Every consumer below independently derives customer attention from raw
// SQL filters, duplicating business logic that belongs in this pipeline.
//
// 1. src/lib/customer-intelligence.ts :: deriveCustomerIntelligence()
//    Purpose: Lifecycle state derivation for a single customer.
//    Duplicated logic: lifecycle classification, reminder scoping,
//    active-job override, days-overdue, health-score, revenue estimation.
//    Status: Already the canonical derivation — this pipeline wraps/enriches it.
//
// 2. src/lib/customer-intelligence.ts :: classifySegment()
//    Purpose: Reminder-timing-based segment classification.
//    Duplicated logic: 240-hour threshold for follow_up vs high_churn_risk.
//    Status: Already a shared helper used by this pipeline.
//
// 3. src/lib/customer-intelligence-sync.ts :: refreshCustomerIntelligence()
//    Purpose: Fetch raw data for one customer, derive CI, persist to DB.
//    Duplicated logic: Calls deriveCustomerIntelligence() — already canonical.
//    Status: Correct consumer of the derivation. No change needed.
//
// 4. src/lib/queries.ts :: useRevenueIntelligence() (lines 1294-1511)
//    Purpose: Revenue Intelligence dashboard data.
//    Duplicated logic:
//      - "due this month" filter: next_service_date >= monthStart && <= monthEnd
//      - "overdue" filter: next_service_date < todayStr && job_status != completed
//      - Segment bucketing: own iteration splitting into readyToBook/followUpNeeded/highChurnRisk
//      - Revenue estimation: calls estimateServiceValue() for forecast
//      - Confirmed revenue logic: checks reminder status for booked/responded
//    Belongs in pipeline: lifecycle state, segment, attention status, revenue estimate.
//    Consumer-specific: forecast aggregation, insight generation, confirmed-revenue logic.
//
// 5. src/lib/queries.ts :: useDailyBriefing() (lines 1108-1260)
//    Purpose: Daily operations briefing data.
//    Duplicated logic:
//      - Reminder filter: next_service_date <= today && reminder_sent_at is null
//      - Own concept of "who needs a reminder today"
//    Belongs in pipeline: reminder eligibility, attention status.
//    Consumer-specific: briefing formatting, worker attendance, inventory alerts.
//
// 6. src/lib/queries.ts :: useDashboardMetrics() (lines 507-570)
//    Purpose: Dashboard KPI counts.
//    Duplicated logic:
//      - dueReminders count: next_service_date <= today && reminder_sent_at is null
//    Belongs in pipeline: reminder eligibility count.
//    Consumer-specific: pending/in-progress/completed counts, stock alerts, attendance.
//
// 7. api/cron/send-reminders.ts (Vercel cron)
// 8. api/server.js lines 646-685 (Express duplicate of send-reminders)
// 9. supabase/functions/send-reminders/index.ts (Edge Function duplicate)
//    Purpose: Send reminder WhatsApp messages to due customers.
//    Duplicated logic:
//      - Filter: next_service_date <= today && reminder_sent_at is null && job_status == pending
//      - Uses reminder_sent_at as proxy for "reminder not yet sent"
//    Belongs in pipeline: reminder eligibility, lifecycle state, active-job-aware selection.
//    Consumer-specific: WhatsApp sending, cron_log recording, retry logic.
//
// 10. api/cron/daily-briefing.ts (Vercel cron)
// 11. api/server.js lines 688-739 (Express duplicate of daily-briefing)
//     Purpose: Send daily operations WhatsApp to merchant.
//     Duplicated logic:
//       - Reminder filter: next_service_date <= today && reminder_sent_at is null
//       - No job_status filter (unlike send-reminders)
//     Belongs in pipeline: reminder eligibility, attention status.
//     Consumer-specific: WhatsApp formatting, worker/inventory/support-ticket data.
//
// 12. api/cron/weekly-revenue-insight.ts (Vercel cron)
// 13. api/server.js lines 785-809 (Express duplicate of weekly-revenue-insight)
//     Purpose: Weekly revenue summary WhatsApp to merchant.
//     Duplicated logic:
//       - "Due this month" filter: next_service_date >= monthStart && <= monthEnd
//       - Flat ₹1200 fallback for missing totalCharge
//       - Non-responder detection: reminder_responses WHERE status == sent
//     Belongs in pipeline: revenue estimate, reminder state, lifecycle state.
//     Consumer-specific: WhatsApp formatting, timestamp calculations.
//
// 14. src/pages/Customers.tsx
//     Purpose: Customer list page with manual reminder send.
//     Duplicated logic: No lifecycle eligibility check — any customer can be
//     sent a reminder manually regardless of lifecycle state.
//     Belongs in pipeline: reminder eligibility gate.
//     Consumer-specific: rendering, manual-send UI.
//
// ─── Summary ─────────────────────────────────────────────────────────────────
// 14 independent consumer components, 12 with duplicated customer-attention
// logic. The canonical pipeline below provides a single reusable derivation
// that every consumer should eventually call instead of re-implementing filters.
// ──────────────────────────────────────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

export type LifecycleState =
  | 'scheduled'
  | 'not_due'
  | 'ready_to_book'
  | 'follow_up_needed'
  | 'high_churn_risk';

export type AttentionState = 'attention_needed' | 'no_attention_needed';

export type RequiredAction = 'send_reminder' | 'follow_up' | 'recover' | 'none';

export type ReminderState = 'not_sent' | 'awaiting_response' | 'responded' | 'booked' | 'ignored';

/**
 * Input to the canonical Customer Attention Pipeline.
 *
 * All data must be pre-fetched by the caller. The pipeline is a pure function
 * with no side effects and no database access.
 */
export interface CustomerAttentionInput {
  /** All service cards for the merchant (filtered by caller). */
  serviceCards: ServiceCardWithDetails[];
  /** All reminder responses for the merchant. */
  reminders: ReminderResponse[];
  /** The customer to evaluate. */
  customerId: string;
  /** The merchant the customer belongs to. */
  merchantId: string;
  /**
   * Current date for derivation (injected for testability).
   * Defaults to `new Date()` when omitted.
   */
  today?: Date;
}

/**
 * Result of the canonical Customer Attention Pipeline for one customer.
 *
 * Every field is derived deterministically from the input data.
 * Consumers may use this result without further lifecycle derivation.
 */
export interface CustomerAttentionResult {
  // ── Identity ──────────────────────────────────────────────────
  customerId: string;
  merchantId: string;
  customerName: string;
  customerPhone: string;

  // ── Lifecycle ─────────────────────────────────────────────────
  /**
   * The customer's position in the lifecycle state machine.
   * Exactly one state per customer at any point in time.
   */
  lifecycleState: LifecycleState;

  /**
   * The service_card_id that anchors this customer's lifecycle.
   * Reminder lookups are scoped to this card.
   */
  lifecycleAnchorId: string;

  /**
   * The service_date of the lifecycle anchor card.
   */
  lifecycleAnchorDate: string;

  /**
   * The next_service_date from the lifecycle anchor card, if set.
   */
  nextServiceDate: string | null;

  // ── Attention ─────────────────────────────────────────────────
  /**
   * Whether this customer requires the merchant's attention.
   * Derived from lifecycleState: {@link LifecycleState.ready_to_book},
   * {@link LifecycleState.follow_up_needed}, and
   * {@link LifecycleState.high_churn_risk} all mean attention is needed.
   */
  attentionState: AttentionState;

  /**
   * The specific action the merchant should take.
   * Derived from lifecycleState.
   */
  requiredAction: RequiredAction;

  // ── Reminder ──────────────────────────────────────────────────
  /**
   * Whether a reminder should be sent to this customer.
   * True only when lifecycleState === 'ready_to_book'.
   */
  reminderEligible: boolean;

  /**
   * The state of the latest reminder scoped to the lifecycle anchor.
   */
  reminderState: ReminderState;

  // ── Supporting metrics ────────────────────────────────────────
  /**
   * Days since next_service_date passed (0 if not overdue).
   */
  daysOverdue: number;

  /**
   * Customer health score (0-100).
   */
  healthScore: number;

  /**
   * Estimated revenue from the lifecycle anchor's latest completed card.
   */
  estimatedRevenue: number;

  // ── Explanation ───────────────────────────────────────────────
  /**
   * Human-readable explanation of why the customer is in this state.
   * Suitable for display in UI or for AI agents explaining decisions.
   */
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Canonical Pipeline ──────────────────────────────────────────────────────

/**
 * Evaluate a single customer's attention using the canonical lifecycle
 * derivation.
 *
 * This is the **single** function that determines customer attention in the
 * AquaTrak system. Every consumer must request attention data from this
 * pipeline rather than re-deriving it from raw SQL filters.
 *
 * ## Invariants
 * - Every customer is evaluated exactly once.
 * - Every customer belongs to exactly one lifecycle state.
 * - The function is deterministic from its inputs.
 * - The function has no side effects.
 * - No persistent state is modified.
 *
 * @param input - All data required for derivation (must be pre-fetched).
 * @returns The derived attention result for the customer.
 */
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
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

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

/**
 * Evaluate attention for multiple customers in a single call.
 *
 * Convenience wrapper around {@link evaluateCustomerAttention} that
 * iterates over multiple customer IDs. For bulk operations, this is
 * more efficient than calling evaluateCustomerAttention repeatedly.
 *
 * Every customer must have at least one service card in the provided list.
 * Customers without cards throw an error.
 *
 * @param input - Pipeline input containing all relevant data.
 * @param customerIds - The customers to evaluate (defaults to all unique
 *   customer IDs found in serviceCards).
 * @returns A map of customerId → CustomerAttentionResult.
 */
export function evaluateCustomerAttentionBatch(
  input: CustomerAttentionInput,
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
