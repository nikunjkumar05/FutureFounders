/**
 * Lifecycle Transition Engine — Validation Scenarios
 *
 * Validates the 8 required scenarios by constructing test data and asserting
 * expected engine outputs at compile time and runtime.
 *
 * The file is not a test runner. Validation is performed via:
 *   1. TypeScript type-checking (npm run typecheck)
 *   2. Assertion functions that throw on mismatch — runnable via:
 *      npx tsx src/lib/lifecycle-transition-engine.validation.ts
 *   3. Code review verification
 *
 * Run: npx tsx src/lib/lifecycle-transition-engine.validation.ts
 */

import { evaluateTransition } from './lifecycle-transition-engine';
import type { ServiceCardWithDetails, ReminderResponse } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');
const TODAY = '2026-07-01';
const YESTERDAY = '2026-06-30';
const TOMORROW = '2026-07-02';
const THREE_MONTHS_AGO = '2026-04-01';
const TWO_MONTHS_AGO = '2026-05-01';
const LAST_MONTH = '2026-06-01';
const MERCHANT_ID = 'merchant-1';
const CUSTOMER_ID_A = 'customer-a';
const CUSTOMER_ID_B = 'customer-b';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(
  overrides: Partial<ServiceCardWithDetails> & { id: string },
  customerId: string = CUSTOMER_ID_A,
): ServiceCardWithDetails {
  return {
    customer_id: customerId,
    merchant_id: MERCHANT_ID,
    service_type: 'standard_cleaning',
    service_details: { totalCharge: 1200, tankCapacity: 1000, totalCapacity: 1000 },
    service_date: THREE_MONTHS_AGO,
    next_service_date: null,
    job_status: 'completed',
    discount: 0,
    feedback_sent: false,
    feedback_rating: null,
    reminder_sent_at: null,
    notes: null,
    technician_id: null,
    created_at: THREE_MONTHS_AGO,
    customers: {
      id: customerId,
      merchant_id: MERCHANT_ID,
      name: 'Test Customer',
      phone: '+919999999999',
      address: 'Test Address',
      latitude: null,
      longitude: null,
      notes: null,
      created_at: THREE_MONTHS_AGO,
    },
    staff: null,
    ...overrides,
  };
}

function makeReminder(
  overrides: Partial<ReminderResponse> & { id: string; service_card_id: string },
  customerId: string = CUSTOMER_ID_A,
): ReminderResponse {
  return {
    merchant_id: MERCHANT_ID,
    customer_id: customerId,
    sent_at: NOW.toISOString(),
    responded_at: null,
    response: null,
    status: 'sent',
    notes: null,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  \u2713 ${message}`);
}

// ─── Scenario 1: Job Created ─────────────────────────────────────────────────
// A new pending job is created. The engine detects active-job override.
console.log('\n── Scenario 1: Job Created ─────────────────────────────');

const s1CardsAfter: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-1-a',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: YESTERDAY,
  }),
  makeCard({
    id: 'card-1-b',
    job_status: 'pending',
    service_date: TODAY,
    next_service_date: null,
  }),
];

// Previous state: no active job, ready_to_book (overdue with no reminder)
const s1PrevState = 'ready_to_book';

const s1Result = evaluateTransition({
  event: { type: 'job_created' },
  serviceCards: s1CardsAfter,
  reminders: [],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s1PrevState,
});

assert(s1Result.lifecycleState === 'scheduled', 'Lifecycle state is scheduled (active job override)');
assert(s1Result.transitionType === 'active_job_override', 'Transition type is active_job_override');
assert(s1Result.previousLifecycleState === 'ready_to_book', 'Previous lifecycle state is ready_to_book');
assert(s1Result.attentionState === 'no_attention_needed', 'No attention needed (scheduled)');
assert(s1Result.requiredAction === 'none', 'Required action is none');
assert(s1Result.reminderEligible === false, 'Not reminder eligible');
assert(s1Result.daysOverdue === 0, 'Days overdue is 0 (override)');
assert(s1Result.healthScore === 100, 'Health score is 100 (override)');

// ─── Scenario 2: Job Completed ───────────────────────────────────────────────
// A job transitions from pending to completed. The engine detects cycle completion.
console.log('\n── Scenario 2: Job Completed ────────────────────────────');

const s2CardsAfter: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-2-a',
    job_status: 'completed',
    service_date: LAST_MONTH,
    next_service_date: TODAY,
  }),
];

// Before this event, the customer had an active (pending) job — state was scheduled.
const s2PrevState = 'scheduled';

const s2Result = evaluateTransition({
  event: { type: 'job_completed' },
  serviceCards: s2CardsAfter,
  reminders: [],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s2PrevState,
});

assert(s2Result.lifecycleState === 'ready_to_book', 'Lifecycle state is ready_to_book (due today)');
assert(s2Result.transitionType === 'cycle_completion', 'Transition type is cycle_completion');
assert(s2Result.previousLifecycleState === 'scheduled', 'Previous lifecycle state is scheduled');
assert(s2Result.attentionState === 'attention_needed', 'Attention needed');
assert(s2Result.requiredAction === 'send_reminder', 'Required action is send_reminder');
assert(s2Result.reminderEligible === true, 'Reminder eligible');
assert(s2Result.daysOverdue === 0, 'Days overdue is 0 (due today)');

// ─── Scenario 3: Reminder Sent ───────────────────────────────────────────────
// A reminder is sent for the current lifecycle. Engine detects reminder transition.
console.log('\n── Scenario 3: Reminder Sent ────────────────────────────');

const FEW_HOURS_AGO = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();

const s3Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-3',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

const s3Reminders: ReminderResponse[] = [
  makeReminder({
    id: 'reminder-3',
    service_card_id: 'card-3',
    sent_at: FEW_HOURS_AGO,
    status: 'sent',
  }),
];

// Before reminder sent: ready_to_book
const s3PrevState = 'ready_to_book';

const s3Result = evaluateTransition({
  event: { type: 'reminder_sent' },
  serviceCards: s3Cards,
  reminders: s3Reminders,
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s3PrevState,
});

assert(s3Result.lifecycleState === 'follow_up_needed', 'Lifecycle state is follow_up_needed');
assert(s3Result.transitionType === 'reminder_transition', 'Transition type is reminder_transition');
assert(s3Result.previousLifecycleState === 'ready_to_book', 'Previous lifecycle state is ready_to_book');
assert(s3Result.reminderState === 'awaiting_response', 'Reminder state is awaiting_response');
assert(s3Result.didReminderStateChange === true, 'Reminder state changed');
assert(s3Result.attentionState === 'attention_needed', 'Attention needed');
assert(s3Result.requiredAction === 'follow_up', 'Required action is follow_up');
assert(s3Result.reminderEligible === false, 'Not reminder eligible');

// ─── Scenario 4: Reminder Responded ──────────────────────────────────────────
// Customer replies "yes". Engine detects reminder state advance.
// Note: classifySegment() is timing-based only — a responded reminder sent
// less than 240h ago still yields follow_up_needed lifecycle state.
console.log('\n── Scenario 4: Reminder Responded ───────────────────────');

const s4Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-4',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

const s4Reminders: ReminderResponse[] = [
  makeReminder({
    id: 'reminder-4',
    service_card_id: 'card-4',
    sent_at: FEW_HOURS_AGO,
    responded_at: NOW.toISOString(),
    response: 'yes',
    status: 'responded',
  }),
];

// Before response: follow_up_needed
const s4PrevState = 'follow_up_needed';

const s4Result = evaluateTransition({
  event: { type: 'reminder_responded' },
  serviceCards: s4Cards,
  reminders: s4Reminders,
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s4PrevState,
});

assert(s4Result.lifecycleState === 'follow_up_needed', 'Lifecycle state is follow_up_needed (timing-based, < 240h)');
assert(s4Result.transitionType === 'reminder_transition', 'Transition type is reminder_transition');
assert(s4Result.previousLifecycleState === 'follow_up_needed', 'Previous lifecycle state is follow_up_needed');
assert(s4Result.reminderState === 'responded', 'Reminder state is responded');
assert(s4Result.didReminderStateChange === true, 'Reminder state changed');
assert(s4Result.requiredAction === 'follow_up', 'Required action is follow_up (timing-based)');
assert(s4Result.reminderEligible === false, 'Not reminder eligible (still in follow-up window)');

// ─── Scenario 5: Booking Created ─────────────────────────────────────────────
// Customer selects time slot → new pending job created. Engine detects active-job override.
console.log('\n── Scenario 5: Booking Created ──────────────────────────');

const s5CardsAfter: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-5-a',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: YESTERDAY,
  }),
  makeCard({
    id: 'card-5-b',
    job_status: 'pending',
    service_date: TOMORROW,
    next_service_date: null,
  }),
];

const s5Reminders: ReminderResponse[] = [
  makeReminder({
    id: 'reminder-5',
    service_card_id: 'card-5-a',
    sent_at: FEW_HOURS_AGO,
    responded_at: NOW.toISOString(),
    response: 'morning',
    status: 'booked',
  }),
];

// Before booking: ready_to_book
const s5PrevState = 'ready_to_book';

const s5Result = evaluateTransition({
  event: { type: 'reminder_booked' },
  serviceCards: s5CardsAfter,
  reminders: s5Reminders,
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s5PrevState,
});

assert(s5Result.lifecycleState === 'scheduled', 'Lifecycle state is scheduled (new active job)');
assert(s5Result.transitionType === 'active_job_override', 'Transition type is active_job_override');
assert(s5Result.previousLifecycleState === 'ready_to_book', 'Previous lifecycle state is ready_to_book');
assert(s5Result.attentionState === 'no_attention_needed', 'No attention needed (scheduled)');
assert(s5Result.requiredAction === 'none', 'Required action is none');
assert(s5Result.reminderEligible === false, 'Not reminder eligible');

// ─── Scenario 6: Historical Reminder Isolation ───────────────────────────────
// When a lifecycle anchor changes (newer completed card), old reminders scoped
// to the previous anchor are ignored by the new lifecycle.
console.log('\n── Scenario 6: Historical Reminder Isolation ────────────');

const TEN_DAYS_AGO = new Date(NOW.getTime() - 241 * 60 * 60 * 1000).toISOString();

const s6CardsAfter: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-6-old',
    job_status: 'completed',
    service_date: THREE_MONTHS_AGO,
    next_service_date: YESTERDAY,
  }),
  // Newer completed card replaces old as the anchor
  makeCard({
    id: 'card-6-new',
    job_status: 'completed',
    service_date: LAST_MONTH,
    next_service_date: TOMORROW,
  }),
];

// Reminder scoped to the OLD card — should be ignored for new lifecycle
const s6Reminders: ReminderResponse[] = [
  makeReminder({
    id: 'reminder-6-old',
    service_card_id: 'card-6-old',
    sent_at: TEN_DAYS_AGO,
    status: 'sent',
  }),
];

// Before the reset: scheduled (customer had active job that just completed)
const s6PrevState = 'scheduled';

const s6Result = evaluateTransition({
  event: { type: 'job_completed' },
  serviceCards: s6CardsAfter,
  reminders: s6Reminders,
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s6PrevState,
});

assert(s6Result.lifecycleAnchorId === 'card-6-new', 'Lifecycle anchor is the newest completed card (card-6-new)');
assert(s6Result.didAnchorChange === true, 'Lifecycle anchor changed from previous');
assert(s6Result.lifecycleState === 'not_due', 'Lifecycle state is not_due (future next_service_date)');
assert(s6Result.reminderState === 'not_sent', 'Reminder state is not_sent (old reminder ignored for new anchor)');
assert(s6Result.attentionState === 'no_attention_needed', 'No attention needed (not_due)');
assert(s6Result.requiredAction === 'none', 'Required action is none');

// ─── Scenario 7: Deterministic Output ────────────────────────────────────────
// The engine produces identical results for identical inputs.
console.log('\n── Scenario 7: Deterministic Output ─────────────────────');

const s7Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-7',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

const s7Input = {
  event: { type: 'job_completed' as const },
  serviceCards: s7Cards,
  reminders: [] as ReminderResponse[],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: 'scheduled' as const,
};

const s7Run1 = evaluateTransition(s7Input);
const s7Run2 = evaluateTransition(s7Input);

assert(
  JSON.stringify(s7Run1) === JSON.stringify(s7Run2),
  'Two calls with identical inputs produce identical results',
);

// ─── Scenario 8: No Side Effects ─────────────────────────────────────────────
// The engine performs no database writes or other side effects.
// Verified architecturally:
//   - evaluateTransition is a pure function (no DB access, no mutations)
//   - All helper functions are pure
//   - Input objects are not mutated
console.log('\n── Scenario 8: No Side Effects ─────────────────────────');

const s8Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-8',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

const s8Reminders: ReminderResponse[] = [];
const s8CardsBefore = JSON.stringify(s8Cards);
const s8RemindersBefore = JSON.stringify(s8Reminders);

evaluateTransition({
  event: { type: 'job_completed' },
  serviceCards: s8Cards,
  reminders: s8Reminders,
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: 'scheduled',
});

assert(
  JSON.stringify(s8Cards) === s8CardsBefore,
  'Input service cards array is not mutated',
);
assert(
  JSON.stringify(s8Reminders) === s8RemindersBefore,
  'Input reminders array is not mutated',
);

// ─── Additional: Temporal Evaluation ─────────────────────────────────────────
// The engine handles temporal events (time-based transitions).
console.log('\n── Scenario 9: Temporal Evaluation (Date Reached) ───────');

const s9Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-9',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

// Before temporal evaluation: not_due (next_service_date was in the future)
const s9PrevState = 'not_due';

const s9Result = evaluateTransition({
  event: { type: 'temporal_evaluation' },
  serviceCards: s9Cards,
  reminders: [],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s9PrevState,
});

assert(s9Result.lifecycleState === 'ready_to_book', 'Lifecycle state is ready_to_book (date reached)');
assert(s9Result.transitionType === 'temporal', 'Transition type is temporal');
assert(s9Result.previousLifecycleState === 'not_due', 'Previous lifecycle state is not_due');
assert(s9Result.requiredAction === 'send_reminder', 'Required action is send_reminder');
assert(s9Result.reminderEligible === true, 'Reminder eligible');

// ─── Additional: No Previous State ───────────────────────────────────────────
// The engine handles callers that do not supply previous lifecycle state.
console.log('\n── Scenario 10: No Previous State Provided ──────────────');

const s10Cards: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-10',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: TODAY,
  }),
];

const s10Result = evaluateTransition({
  event: { type: 'temporal_evaluation' },
  serviceCards: s10Cards,
  reminders: [],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
});

assert(s10Result.previousLifecycleState === null, 'Previous lifecycle state is null when not provided');
assert(s10Result.lifecycleState === 'ready_to_book', 'Lifecycle state is still correctly derived');
assert(s10Result.attentionState === 'attention_needed', 'Attention needed');
assert(s10Result.requiredAction === 'send_reminder', 'Required action is send_reminder');

// ─── Additional: Active Job Removed ──────────────────────────────────────────
// An active job is deleted. The engine detects the override being lifted.
console.log('\n── Scenario 11: Active Job Removed ───────────────────────');

const s11CardsAfter: ServiceCardWithDetails[] = [
  makeCard({
    id: 'card-11',
    job_status: 'completed',
    service_date: TWO_MONTHS_AGO,
    next_service_date: YESTERDAY,
  }),
];

// Before deletion: customer had active job (now removed), state was scheduled
const s11PrevState = 'scheduled';

const s11Result = evaluateTransition({
  event: { type: 'job_deleted' },
  serviceCards: s11CardsAfter,
  reminders: [],
  customerId: CUSTOMER_ID_A,
  merchantId: MERCHANT_ID,
  today: NOW,
  previousLifecycleState: s11PrevState,
});

assert(s11Result.lifecycleState === 'ready_to_book', 'Lifecycle state is ready_to_book (back from scheduled)');
assert(s11Result.transitionType === 'active_job_removed', 'Transition type is active_job_removed');
assert(s11Result.previousLifecycleState === 'scheduled', 'Previous lifecycle state is scheduled');
assert(s11Result.attentionState === 'attention_needed', 'Attention needed');
assert(s11Result.requiredAction === 'send_reminder', 'Required action is send_reminder');

// ─── Additional: Multiple Customers ──────────────────────────────────────────
// The batch evaluation handles multiple customers.
console.log('\n── Scenario 12: Batch Evaluation ─────────────────────────');

const { evaluateTransitionBatch } = await import('./lifecycle-transition-engine');

const s12CardsA = makeCard({
  id: 'card-12-a',
  job_status: 'completed',
  service_date: TWO_MONTHS_AGO,
  next_service_date: TODAY,
}, CUSTOMER_ID_A);

const s12CardsB = makeCard({
  id: 'card-12-b',
  job_status: 'completed',
  service_date: TWO_MONTHS_AGO,
  next_service_date: TOMORROW,
}, CUSTOMER_ID_B);

const s12BatchInput = {
  event: { type: 'temporal_evaluation' as const },
  serviceCards: [s12CardsA, s12CardsB],
  reminders: [] as ReminderResponse[],
  merchantId: MERCHANT_ID,
  today: NOW,
};

const s12Results = evaluateTransitionBatch(s12BatchInput);

assert(s12Results.size === 2, 'Batch returns results for 2 customers');

const s12ResultA = s12Results.get(CUSTOMER_ID_A);
const s12ResultB = s12Results.get(CUSTOMER_ID_B);

assert(s12ResultA !== undefined, 'Customer A has a result');
assert(s12ResultB !== undefined, 'Customer B has a result');
assert(s12ResultA!.lifecycleState === 'ready_to_book', 'Customer A: ready_to_book (due today)');
assert(s12ResultB!.lifecycleState === 'not_due', 'Customer B: not_due (due tomorrow)');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n── All Validation Scenarios Passed ──────────────────────');
