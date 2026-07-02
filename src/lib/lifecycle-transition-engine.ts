// See docs/lifecycle-transition-audit.md for the full architecture audit
// of duplicated lifecycle-transition logic across the codebase.

import type {
  ServiceCardWithDetails,
  ReminderResponse,
} from './types';
import { buildLatestCompletedByCustomer } from './customer-intelligence';
import {
  evaluateCustomerAttention,
  type CustomerAttentionInput,
  type CustomerAttentionResult,
  type LifecycleState,
  type AttentionState,
  type RequiredAction,
  type ReminderState,
} from './customer-attention-pipeline';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Business events that trigger lifecycle transitions.
 * Each event corresponds to an operational action performed by some component.
 */
export type LifecycleEventType =
  | 'job_created'
  | 'job_completed'
  | 'job_deleted'
  | 'reminder_sent'
  | 'reminder_responded'
  | 'reminder_booked'
  | 'reminder_ignored'
  | 'temporal_evaluation';

/**
 * The kind of lifecycle transition that occurred.
 * Determined by the engine from the event type and state comparison.
 */
export type TransitionType =
  | 'lifecycle_start'
  | 'cycle_completion'
  | 'cycle_reset'
  | 'active_job_override'
  | 'active_job_removed'
  | 'reminder_transition'
  | 'temporal';

/**
 * Input to the Canonical Lifecycle Transition Engine.
 *
 * The caller provides:
 * 1. The event that just occurred.
 * 2. Current raw data (service cards + reminders) reflecting the state AFTER
 *    the event was applied.
 * 3. Optionally, the previous lifecycle state (before the event). If omitted,
 *    the engine evaluates current data only and sets previous state to null.
 */
export interface TransitionInput {
  /** The business event that triggered this evaluation. */
  event: {
    type: LifecycleEventType;
    timestamp?: string;
  };

  /** Current data — must reflect the state AFTER the event was applied. */
  serviceCards: ServiceCardWithDetails[];
  reminders: ReminderResponse[];
  customerId: string;
  merchantId: string;

  /**
   * Injected current date for deterministic evaluation.
   * Defaults to `new Date()` when omitted.
   */
  today?: Date;

  /**
   * The lifecycle state before the event occurred.
   * Callers may supply this from a cached CI value or from their own state.
   * When omitted, `previousLifecycleState` in the result is null.
   */
  previousLifecycleState?: LifecycleState | null;
}

/**
 * Result of a lifecycle transition evaluation for one customer.
 *
 * Contains the full before/after lifecycle state, the transition type,
 * derived attention and reminder states, and a human-readable reason.
 */
export interface TransitionResult {
  // ── Identity ──────────────────────────────────────────────────
  customerId: string;
  merchantId: string;

  // ── Lifecycle transition ──────────────────────────────────────
  /** The lifecycle state before the event. Null if unknown. */
  previousLifecycleState: LifecycleState | null;
  /** The lifecycle state after the event. */
  lifecycleState: LifecycleState;
  /** What kind of transition occurred. */
  transitionType: TransitionType;
  /** The service_card_id anchoring the lifecycle after the event. */
  lifecycleAnchorId: string;
  /** The service_date of the lifecycle anchor. */
  lifecycleAnchorDate: string;
  /** The next_service_date from the lifecycle anchor. */
  nextServiceDate: string | null;
  /** Whether the lifecycle anchor changed as a result of this transition. */
  didAnchorChange: boolean;

  // ── Reminder ──────────────────────────────────────────────────
  /** Reminder state scoped to the current lifecycle anchor. */
  reminderState: ReminderState;
  /** Whether the reminder state changed as a result of this event. */
  didReminderStateChange: boolean;

  // ── Attention ─────────────────────────────────────────────────
  attentionState: AttentionState;
  requiredAction: RequiredAction;
  reminderEligible: boolean;

  // ── Metrics ───────────────────────────────────────────────────
  daysOverdue: number;
  healthScore: number;
  estimatedRevenue: number;

  // ── Explanation ───────────────────────────────────────────────
  /** Human-readable explanation of the transition. */
  reason: string;
  /** Human-readable explanation of what changed. */
  changeDescription: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Canonical Transition Engine ─────────────────────────────────────────────

/**
 * Evaluate a single customer's lifecycle transition.
 *
 * This is the **single** function that determines lifecycle transitions in the
 * AquaTrak system. Every operational component that mutates lifecycle-relevant
 * data must call this engine to determine the resulting lifecycle transition.
 *
 * ## Invariants
 * - Every lifecycle transition is evaluated exactly once.
 * - Every lifecycle transition has exactly one canonical owner (this engine).
 * - The function is deterministic from its inputs.
 * - The function has no side effects.
 * - No persistent state is modified.
 *
 * @param input - The event, current data, and optional previous state.
 * @returns The derived transition result.
 */
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

  // ── 1. Evaluate current lifecycle state via canonical pipeline ──
  const pipelineInput: CustomerAttentionInput = {
    serviceCards,
    reminders,
    customerId,
    merchantId,
    today,
  };

  const current: CustomerAttentionResult = evaluateCustomerAttention(pipelineInput);

  // ── 2. Determine the lifecycle anchor before the event ──
  // We reconstruct the previous anchor from current data + event type.
  // For job_completed/reminder_booked, the new card is in the data now;
  // the previous anchor was whatever was there before.
  let previousAnchorId: string | null = null;

  switch (event.type) {
    case 'job_completed': {
      // The completed card is now in the data. The previous anchor was the
      // latest completed card before this one, or the most recent card.
      const allCompleted = serviceCards.filter(c => c.job_status === 'completed');
      // If the anchor changed, there were already completed cards before.
      const latestAnchor = buildLatestCompletedByCustomer(serviceCards).get(customerId);
      if (latestAnchor && allCompleted.length > 1) {
        // There was at least one completed card before this event.
        // Find the previous anchor by looking at the second-newest completed card.
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
      // A new service card was just created. The previous anchor was the
      // same as the current one (the creation doesn't change the anchor).
      previousAnchorId = current.lifecycleAnchorId;
      break;
    }
    default: {
      // For most events, the anchor doesn't change.
      previousAnchorId = current.lifecycleAnchorId;
      break;
    }
  }

  // ── 3. Determine transition type ──
  const prevState: LifecycleState | null = previousLifecycleState ?? null;
  const transitionType = determineTransitionType(
    event.type,
    prevState,
    current.lifecycleState,
    previousAnchorId,
    current.lifecycleAnchorId,
  );

  // ── 4. Determine whether anchor changed ──
  const didAnchorChange = previousAnchorId !== null
    && previousAnchorId !== current.lifecycleAnchorId;

  // ── 5. Determine reminder state change ──
  // Without the previous reminder state, we infer from the event type.
  // For reminder events, the state always changes.
  const reminderEventTypes: LifecycleEventType[] = [
    'reminder_sent', 'reminder_responded', 'reminder_booked', 'reminder_ignored',
  ];
  const didReminderStateChange = reminderEventTypes.includes(event.type);

  // ── 6. Build description ──
  const changeDescription = buildChangeDescription(
    transitionType,
    prevState,
    current.lifecycleState,
    didReminderStateChange,
  );

  // ── 7. Build and return result ──
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

/**
 * Evaluate lifecycle transitions for multiple customers.
 *
 * Convenience wrapper around {@link evaluateTransition}.
 *
 * @param input - Base transition input (shared event, merchant, etc.).
 * @param customerIds - Optional subset of customers to evaluate.
 *   Defaults to all unique customer IDs in serviceCards.
 * @returns A map of customerId → TransitionResult.
 */
export function evaluateTransitionBatch(
  input: Omit<TransitionInput, 'customerId'>,
  customerIds?: string[],
): Map<string, TransitionResult> {
  const ids = customerIds
    ?? [...new Set(input.serviceCards.map(c => c.customer_id))];

  const results = new Map<string, TransitionResult>();

  for (const customerId of ids) {
    const result = evaluateTransition({
      ...input,
      customerId,
    });
    results.set(customerId, result);
  }

  return results;
}
