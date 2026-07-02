// ─── Phase 1: Audit of existing transition-input resolution ────────────────
//
// Every write-side workflow below independently resolves canonical transition
// inputs (service cards, reminders, previous lifecycle state). The Transition
// Service (this file) becomes the single canonical input resolver that every
// workflow will eventually call.
//
// ── Currently resolved data by each workflow ───────────────────────────────
//
// | WF | Workflow               | File                           | Currently Fetches                        | Duplicated Fetch? | Replaced By Service? |
// |----|------------------------|--------------------------------|------------------------------------------|-------------------|----------------------|
// | W1 | useCreateJob          | src/lib/queries.ts:118         | Nothing (only mutated card in scope)     | —                 | Yes — service fetches |
// | W2 | useUpdateJobStatus    | src/lib/queries.ts:78          | Nothing (only mutated card in scope)     | —                 | Yes — service fetches |
// | W3 | useUpdateJob          | src/lib/queries.ts:776         | Nothing (data-only update)               | —                 | No — no transition   |
// | W4 | useDeleteJob          | src/lib/queries.ts:852         | Nothing (raw delete)                     | —                 | No — no transition   |
// | W5 | useMarkReminderSent   | src/lib/queries.ts:432         | Nothing (legacy — to be retired)         | —                 | No — to be retired   |
// | W6 | useCreateReminderResp | src/lib/queries.ts:1553        | Nothing (only mutated reminder in scope) | —                 | Yes — service fetches |
// | W8 | Send Reminders Cron   | api/cron/send-reminders.ts     | Narrow SQL filter (due + unsent)         | Partial           | Yes — service fetches |
// | W11| Webhook Response      | api/webhook/index.ts:150       | Anchor card lookup + single reminder     | Yes (partial)     | Yes — service fetches |
// | W12| Webhook Booking       | api/webhook/index.ts:172       | Reminder lookup + creates card           | Yes (partial)     | Yes — service fetches |
// | W13| Webhook Completed     | api/webhook/index.ts:323       | Active jobs per staff                    | Yes (partial)     | Yes — service fetches |
// | W18| CI Sync               | src/lib/customer-intelligence- | FULL fetch: cards + reminders + CI       | N/A (reference)   | Yes — same fetch, new |
// |    |                       | sync.ts:22                     | for one customer                         |                   | derivation path      |
//
// ── Confirmation ───────────────────────────────────────────────────────────
//
// Every required canonical input can be resolved by the Transition Service:
//  - service_cards (per customer):   Yes — query filters by customer_id
//  - reminder_responses (per customer): Yes — query filters by customer_id
//  - customer_intelligence (per customer): Yes — query filters by customer_id
//  - All queries are scoped per-customer, matching the existing CI sync pattern
//
// No additional canonical data is required beyond what the engine already
// accepts in TransitionInput.
//
// ───────────────────────────────────────────────────────────────────────────

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

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Request to evaluate a lifecycle transition for a customer.
 *
 * The caller supplies only the identity and the event that occurred.
 * All canonical data is resolved internally by the service.
 */
export interface TransitionServiceRequest {
  /** The merchant the customer belongs to. */
  merchantId: string;
  /** The customer whose lifecycle is being evaluated. */
  customerId: string;
  /** The business event that just occurred. */
  event: {
    type: LifecycleEventType;
    timestamp?: string;
  };
}

/**
 * Optional pre-fetched data to avoid redundant database queries.
 *
 * Callers that already possess canonical data (e.g., a cron that loaded
 * all cards + reminders for pipeline eligibility) can supply them here.
 * The Transition Service remains the canonical owner of input resolution
 * regardless of whether data is fetched internally or supplied via overrides.
 */
export interface TransitionServiceOptions {
  /** Pre-fetched service cards for the customer. Skips DB query when provided. */
  serviceCards?: ServiceCardWithDetails[];
  /** Pre-fetched reminder responses for the customer. Skips DB query when provided. */
  reminders?: ReminderResponse[];
  /**
   * Pre-supplied previous lifecycle state.
   * Skips customer_intelligence lookup when provided.
   * Pass `null` explicitly to indicate "definitely unknown".
   */
  previousLifecycleState?: LifecycleState | null;
  /**
   * Injected current date for deterministic evaluation.
   * Defaults to `new Date()` when omitted (engine behaviour).
   */
  today?: Date;
}

// ─── Import LifecycleState from pipeline (re-exported for caller convenience) ─

export type { LifecycleEventType, TransitionResult } from './lifecycle-transition-engine';
export type { LifecycleState } from './customer-attention-pipeline';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Map a stored CustomerSegment to a LifecycleState for use
 * as previous lifecycle state.
 *
 * `'unknown'` maps to `null` because it represents an uninitialized
 * or unrecognised state — the engine handles `null` correctly.
 */
function segmentToLifecycleState(segment: CustomerSegment): LifecycleState | null {
  if (segment === 'unknown') return null;
  return segment as LifecycleState;
}

/**
 * Resolve the previous lifecycle state from stored customer_intelligence.
 *
 * When no CI record exists, returns null (engine handles this correctly).
 * When the CI record has an invalid segment, returns null.
 */
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
  } catch {
    return null;
  }
}

// ─── Canonical Transition Service ──────────────────────────────────────────

/**
 * Resolve canonical transition inputs for a customer and evaluate the
 * lifecycle transition using the pure Lifecycle Transition Engine.
 *
 * This is the **single** entry point for write-side lifecycle evaluation.
 * Every operational workflow that mutates lifecycle-relevant data must call
 * this function to determine the resulting lifecycle transition.
 *
 * ## Invariants
 * - The Lifecycle Transition Engine remains pure (no side effects).
 * - The service performs no persistence, no cache invalidation,
 *   no notification delivery, and no business derivation.
 * - The service performs only canonical input resolution.
 * - Identical canonical inputs produce identical TransitionResults.
 * - No lifecycle business rules change.
 *
 * ## Data Resolution
 * - service_cards (per customer): fetched from DB unless supplied via options.
 * - reminder_responses (per customer): fetched from DB unless supplied via options.
 * - customer_intelligence: queried for stored segment -> previous lifecycle state,
 *   unless explicitly supplied via options.
 *
 * @param supabase - Authenticated Supabase client with read access to
 *   service_cards (with customers join), reminder_responses, and
 *   customer_intelligence tables.
 * @param request - The transition request (merchant, customer, event).
 * @param options - Optional pre-fetched data to avoid redundant queries.
 * @returns The derived TransitionResult from the engine.
 *
 * @throws If no service cards exist for the customer (propagated from engine).
 * @throws If Supabase queries fail (propagated).
 */
export async function evaluateTransitionForCustomer(
  supabase: SupabaseClient,
  request: TransitionServiceRequest,
  options?: TransitionServiceOptions,
): Promise<TransitionResult> {
  const { merchantId, customerId, event } = request;
  const today = options?.today;

  // ── 1. Resolve service cards, reminders, and previous state in parallel ──
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

  // ── 4. Invoke the pure Lifecycle Transition Engine ──
  // The engine is synchronous and side-effect free.
  // Its output is returned directly without transformation.
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

// ─── Data Resolution ───────────────────────────────────────────────────────

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
