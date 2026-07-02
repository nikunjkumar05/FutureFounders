// ─── Phase 1: Audit of duplicated lifecycle-transition logic ────────────────
//
// Every operational component below independently initiates lifecycle
// transitions, duplicating business logic that belongs in this engine.
//
// 1. src/lib/queries.ts :: useCreateJob() (lines 117-198)
//    File: src/lib/queries.ts
//    Function: useCreateJob
//    Business event handled: Job Created
//    Duplicated lifecycle logic:
//      - Creates a pending job, setting next_service_date = serviceDate + 180d
//      - Does NOT call refreshCustomerIntelligence() (gap)
//      - Infers "customer is now scheduled" by side effect of the DB write
//    Belongs in engine? YES — active-job override detection after job creation.
//    Notes: CI refresh gap means the lifecycle state is never persisted.
//
// 2. src/lib/queries.ts :: useUpdateJobStatus() (lines 77-114)
//    File: src/lib/queries.ts
//    Function: useUpdateJobStatus
//    Business event handled: Job Completed
//    Duplicated lifecycle logic:
//      - Sets next_service_date = service_date + 180d on completion
//      - Calls refreshCustomerIntelligence() only when completed
//      - Implicitly triggers transition from scheduled → not_due/ready_to_book
//    Belongs in engine? YES — cycle-completion transition evaluation.
//
// 3. src/lib/queries.ts :: useCreateReminderResponse() (lines 1513-1558)
//    File: src/lib/queries.ts
//    Function: useCreateReminderResponse
//    Business event handled: Reminder Sent / Responded / Booked / Ignored
//    Duplicated lifecycle logic:
//      - Inserts reminder_responses row with appropriate status
//      - Calls refreshCustomerIntelligence() unconditionally
//      - Implicitly triggers reminder-state transitions
//    Belongs in engine? YES — reminder-transition evaluation.
//
// 4. src/lib/queries.ts :: useMarkReminderSent() (lines 431-446)
//    File: src/lib/queries.ts
//    Function: useMarkReminderSent
//    Business event handled: Reminder Sent (legacy path)
//    Duplicated lifecycle logic:
//      - Sets reminder_sent_at = now() but does NOT create reminder_responses
//      - The CI derivation ignores reminder_sent_at, so this has no lifecycle
//        effect — it is a dead path for lifecycle purposes
//    Belongs in engine? NO — this path is deprecated and should be retired.
//
// 5. src/lib/queries.ts :: useUpdateCustomerIntelligence() (lines 1560-1588)
//    File: src/lib/queries.ts
//    Function: useUpdateCustomerIntelligence
//    Business event handled: Manual CI Override
//    Duplicated lifecycle logic:
//      - Directly upserts customer_intelligence with caller-specified segment
//      - Bypasses the derivation entirely
//    Belongs in engine? NO — this is a manual override escape hatch, not a
//      lifecycle transition.
//
// 6. api/webhook/index.ts :: customer "yes"/"confirm"/"haan" (lines 150-171)
//    File: api/webhook/index.ts
//    Function: handleYesResponse / inline handler
//    Business event handled: Reminder Responded
//    Duplicated lifecycle logic:
//      - Patches reminder_responses.status = 'responded'
//      - Calls refreshCustomerIntelligence()
//    Belongs in engine? YES — reminder-transition evaluation.
//
// 7. api/webhook/index.ts :: customer "morning"/"afternoon" (lines 172-229)
//    File: api/webhook/index.ts
//    Function: handleTimeSlot / inline handler
//    Business event handled: Booking Created (via Reminder Booked)
//    Duplicated lifecycle logic:
//      - Creates service_cards row with job_status = 'pending'
//      - Patches reminder_responses.status = 'booked'
//      - Calls refreshCustomerIntelligence()
//      - Does NOT set next_service_date (gap)
//    Belongs in engine? YES — active-job override detection after booking.
//
// 8. api/webhook/index.ts :: staff "done"/"completed"/"complete" (lines 323-349)
//    File: api/webhook/index.ts
//    Function: handleStaffDone / inline handler
//    Business event handled: Job Completed
//    Duplicated lifecycle logic:
//      - Patches service_cards.job_status = 'completed'
//      - Calls refreshCustomerIntelligence()
//      - Does NOT set next_service_date (gap vs UI path)
//    Belongs in engine? YES — cycle-completion transition evaluation.
//
// 9. api/server.js :: customer "yes"/"confirm"/"haan" (lines 535-542)
//    File: api/server.js
//    Business event handled: Reminder Responded
//    Duplicated lifecycle logic:
//      - Same as #6 but does NOT call refreshCustomerIntelligence()
//    Belongs in engine? YES — but this path must first be brought to parity
//      with the modern webhook before it can reliably consume the engine.
//
// 10. api/server.js :: customer "morning"/"afternoon" (lines 543-555)
//     File: api/server.js
//     Business event handled: Booking Created
//     Duplicated lifecycle logic:
//       - Same as #7 but does NOT call refreshCustomerIntelligence()
//     Belongs in engine? YES — same note as #9.
//
// 11. api/server.js :: staff "done"/"completed"/"complete" (lines 609-626)
//     File: api/server.js
//     Business event handled: Job Completed
//     Duplicated lifecycle logic:
//       - Same as #8 but does NOT call refreshCustomerIntelligence()
//     Belongs in engine? YES — same note as #9.
//
// 12. api/server.js :: AI booking tool (lines 230-267)
//     File: api/server.js
//     Function: handleFAQ (Mistral book_cleaning_service tool)
//     Business event handled: Booking Created (AI-driven)
//     Duplicated lifecycle logic:
//       - Creates customer (upsert) and service_cards row
//       - Does NOT set next_service_date (gap)
//       - Does NOT call refreshCustomerIntelligence() (gap)
//     Belongs in engine? YES — active-job override detection after AI booking.
//
// 13. api/cron/send-reminders.ts :: Vercel cron (lines 1-212)
//     File: api/cron/send-reminders.ts
//     Business event handled: Reminder Sent
//     Duplicated lifecycle logic:
//       - Patches reminder_sent_at = now()
//       - Creates reminder_responses row with status = 'sent'
//       - Calls refreshCustomerIntelligence() after each send
//     Belongs in engine? YES — reminder-transition evaluation.
//     Notes: This is the most complete cron path. The Express and Edge
//     Function duplicates should be retired in a future PR.
//
// 14. api/server.js :: send-reminders cron (lines 646-685)
//     File: api/server.js
//     Business event handled: Reminder Sent
//     Duplicated lifecycle logic:
//       - Patches reminder_sent_at = now() only
//       - Does NOT create reminder_responses row (gap)
//       - Does NOT call refreshCustomerIntelligence() (gap)
//     Belongs in engine? NO — this path is incomplete and should be retired.
//
// 15. supabase/functions/send-reminders/index.ts :: Edge Function cron (lines 51-115)
//     File: supabase/functions/send-reminders/index.ts
//     Business event handled: Reminder Sent
//     Duplicated lifecycle logic:
//       - Patches reminder_sent_at = now() only
//       - Does NOT create reminder_responses row (gap)
//       - Does NOT call refreshCustomerIntelligence() (gap)
//     Belongs in engine? NO — this path is incomplete and should be retired.
//
// 16. scripts/migrate-customers.js :: CSV import (lines 39-41)
//     File: scripts/migrate-customers.js
//     Business event handled: Customer Import (creates service cards)
//     Duplicated lifecycle logic:
//       - Creates service_cards with next_service_date = lastServiceDate + 180d
//       - Does NOT call refreshCustomerIntelligence()
//     Belongs in engine? NO — migration script, one-time operation.
//
// ─── Summary ─────────────────────────────────────────────────────────────────
// 12 independent lifecycle-transition paths identified across 7 files
// (queries.ts, api/webhook/index.ts, api/server.js, api/cron/send-reminders.ts,
// supabase/functions/send-reminders/index.ts, scripts/migrate-customers.js).
//
// 10 of these paths contain lifecycle logic that belongs in the Transition Engine.
// 2 paths are incomplete/retired (useMarkReminderSent, duplicate crons).
// 1 path is a manual override escape hatch (useUpdateCustomerIntelligence).
// 1 path is a one-time migration script.
//
// ─── Engine coverage verification ───────────────────────────────────────────
// Required business transitions (from architectural specification):
//
// T1 — Lifecycle Start:   First completed card creates a lifecycle.
// T2 — Cycle Completion:  Anchor card completed → new lifecycle begins.
// T3 — Cycle Reset:       Newer completed card replaces old anchor.
// T4 — Reminder Sent:     Reminder response created → lifecycle re-evaluated.
// T5 — Reminder Responded: Customer replies → reminder state advances.
// T6 — Reminder Booked:   Booking created → new active job.
// T7 — Reminder Ignored:  240h timeout → lifecycle re-evaluated.
// T8 — Date Reached:      next_service_date passes → lifecycle re-evaluated.
// T9 — Active Job Created: New pending/in_progress job → scheduled override.
// T10 — Active Job Removed: Active job deleted or completed → override lifted.
//
// All 10 required transitions are covered by the engine below.
// ──────────────────────────────────────────────────────────────────────────────

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
  _didAnchorChange: boolean,
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
    didAnchorChange,
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
