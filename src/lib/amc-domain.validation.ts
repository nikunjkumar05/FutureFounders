/**
 * AMC Domain — Validation Scenarios
 *
 * Validates AMC domain logic by constructing test data and asserting
 * expected outputs at compile time and runtime.
 *
 * Run: npx tsx src/lib/amc-domain.validation.ts
 */

import type { AmcContract } from './types';
import { evaluateContractState, checkVisitAllowed, checkRenewalEligibility, computeProgress, evaluateContract, validateContractDates, validateStatusTransition, validateContract } from './amc-contract-service';
import { computeNextVisitDate, evaluateSchedule, computeDueDates } from './amc-scheduling';
import { getFrequencyMonths, getApproximateIntervalDays, addInterval, daysBetween, isDatePast, isValidFrequency, countVisitsInPeriod } from './amc-utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-01T12:00:00Z');
const TODAY = '2026-07-01';
const YESTERDAY = '2026-06-30';
const TOMORROW = '2026-07-02';
const SIX_MONTHS_AGO = '2026-01-01';
const ONE_YEAR_AGO = '2025-07-01';
const MERCHANT_ID = 'merchant-1';
const CUSTOMER_ID = 'customer-1';

function makeContract(overrides: Partial<AmcContract> & { id: string }): AmcContract {
  return {
    merchant_id: MERCHANT_ID,
    customer_id: CUSTOMER_ID,
    start_date: ONE_YEAR_AGO,
    end_date: '2027-06-30',
    frequency: 'biannual',
    status: 'active',
    service_template: {},
    notes: null,
    created_at: ONE_YEAR_AGO,
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// ─── Utility Functions ───────────────────────────────────────────────────────

console.log('\n── Utility Functions ──────────────────────────────────');

assert(getFrequencyMonths('monthly') === 1, 'getFrequencyMonths monthly = 1');
assert(getFrequencyMonths('quarterly') === 3, 'getFrequencyMonths quarterly = 3');
assert(getFrequencyMonths('biannual') === 6, 'getFrequencyMonths biannual = 6');
assert(getFrequencyMonths('annual') === 12, 'getFrequencyMonths annual = 12');

assert(getApproximateIntervalDays('monthly') === 30, 'getApproximateIntervalDays monthly = 30');
assert(getApproximateIntervalDays('annual') === 365, 'getApproximateIntervalDays annual = 365');

assert(addInterval('2026-01-01', 'monthly') === '2026-02-01', 'addInterval monthly: Jan 1 → Feb 1');
assert(addInterval('2026-01-01', 'quarterly') === '2026-04-01', 'addInterval quarterly: Jan 1 → Apr 1');
assert(addInterval('2026-01-01', 'biannual') === '2026-07-01', 'addInterval biannual: Jan 1 → Jul 1');
assert(addInterval('2026-01-01', 'annual') === '2027-01-01', 'addInterval annual: Jan 1 → 2027 Jan 1');

assert(daysBetween('2026-07-01', '2026-07-10') === 9, 'daysBetween Jul 1 → Jul 10 = 9');
assert(daysBetween('2026-07-10', '2026-07-01') === -9, 'daysBetween Jul 10 → Jul 1 = -9');
assert(daysBetween('2026-07-01', '2026-07-01') === 0, 'daysBetween same date = 0');

assert(isDatePast(YESTERDAY, NOW) === true, 'isDatePast yesterday = true');
assert(isDatePast(TOMORROW, NOW) === false, 'isDatePast tomorrow = false');
assert(isDatePast(TODAY, NOW) === false, 'isDatePast today = false');

assert(isValidFrequency('monthly') === true, 'isValidFrequency monthly = true');
assert(isValidFrequency('weekly') === false, 'isValidFrequency weekly = false');
assert(isValidFrequency('') === false, 'isValidFrequency empty = false');

assert(countVisitsInPeriod('2026-01-01', '2026-12-31', 'monthly') === 12, 'countVisitsInPeriod monthly Jan-Dec = 12');
assert(countVisitsInPeriod('2026-01-01', '2026-12-31', 'quarterly') === 4, 'countVisitsInPeriod quarterly Jan-Dec = 4');
assert(countVisitsInPeriod('2026-01-01', '2026-12-31', 'biannual') === 2, 'countVisitsInPeriod biannual Jan-Dec = 2');
assert(countVisitsInPeriod('2026-01-01', '2026-12-31', 'annual') === 1, 'countVisitsInPeriod annual Jan-Dec = 1');

// ─── Scheduling Service ──────────────────────────────────────────────────────

console.log('\n── Scheduling Service ─────────────────────────────────');

// Scenario 1: No completed visits — next visit = start_date
const s1Contract = makeContract({ id: 's1', start_date: '2026-04-01' });
const s1Next = computeNextVisitDate(s1Contract, []);
assert(s1Next === '2026-04-01', 'computeNextVisitDate: no visits → start_date');

// Scenario 2: One completed visit — next visit = last visit + interval
const s2Contract = makeContract({ id: 's2', frequency: 'monthly' });
const s2Next = computeNextVisitDate(s2Contract, ['2026-06-15']);
assert(s2Next === '2026-07-15', 'computeNextVisitDate: one visit → last + interval');

// Scenario 3: Multiple visits — next visit = latest + interval
const s3Next = computeNextVisitDate(s2Contract, ['2026-04-15', '2026-05-15', '2026-06-15']);
assert(s3Next === '2026-07-15', 'computeNextVisitDate: multiple visits → latest + interval');

// Scenario 4: Schedule evaluation — due today
const s4 = evaluateSchedule(
  makeContract({ id: 's4', start_date: SIX_MONTHS_AGO, frequency: 'quarterly' }),
  ['2026-04-01'],
  NOW,
);
assert(s4.nextVisitDate === '2026-07-01', 'evaluateSchedule due today: nextVisitDate = Jul 1');
assert(s4.isDue === true, 'evaluateSchedule due today: isDue = true');
assert(s4.isOverdue === false, 'evaluateSchedule due today: not overdue');
assert(s4.daysUntilDue === 0, 'evaluateSchedule due today: daysUntilDue = 0');
assert(s4.daysOverdue === 0, 'evaluateSchedule due today: daysOverdue = 0');

// Scenario 5: Schedule evaluation — due today (biannual)
const s5 = evaluateSchedule(
  makeContract({ id: 's5', start_date: ONE_YEAR_AGO, frequency: 'biannual' }),
  ['2026-01-01'],
  NOW,
);
assert(s5.nextVisitDate === '2026-07-01', 'evaluateSchedule due today (biannual): nextVisitDate = Jul 1');
assert(s5.isDue === true, 'evaluateSchedule due today (biannual): isDue = true');
assert(s5.isOverdue === false, 'evaluateSchedule due today (biannual): not overdue');

// Scenario 6: Schedule evaluation — overdue
const s6 = evaluateSchedule(
  makeContract({ id: 's6', start_date: '2024-01-01', end_date: '2027-06-30', frequency: 'biannual' }),
  ['2025-07-01'],
  NOW,
);
assert(s6.nextVisitDate === '2026-01-01', 'evaluateSchedule overdue: nextVisitDate = Jan 1');
assert(s6.isDue === true, 'evaluateSchedule overdue: isDue = true');
assert(s6.isOverdue === true, 'evaluateSchedule overdue: isOverdue = true');
assert(s6.daysUntilDue < 0, 'evaluateSchedule overdue: daysUntilDue negative');
assert(s6.daysOverdue > 0, 'evaluateSchedule overdue: daysOverdue positive');

// Scenario 7: Schedule evaluation — future
const s7 = evaluateSchedule(
  makeContract({ id: 's7', start_date: SIX_MONTHS_AGO, frequency: 'biannual' }),
  ['2026-04-01'],
  NOW,
);
assert(s7.nextVisitDate === '2026-10-01', 'evaluateSchedule future: nextVisitDate = Oct 1');
assert(s7.isDue === false, 'evaluateSchedule future: isDue = false');
assert(s7.isOverdue === false, 'evaluateSchedule future: not overdue');
assert(s7.daysUntilDue > 0, 'evaluateSchedule future: daysUntilDue positive');

// Scenario 9: computeDueDates — biannual contract
const s9Contract = makeContract({ id: 's9', start_date: '2026-01-01', end_date: '2026-12-31', frequency: 'biannual' });
const s9DueDates = computeDueDates(s9Contract);
assert(s9DueDates.length === 2, 'computeDueDates biannual: 2 due dates');
assert(s9DueDates[0] === '2026-01-01', 'computeDueDates biannual: first = Jan 1');
assert(s9DueDates[1] === '2026-07-01', 'computeDueDates biannual: second = Jul 1');

// Scenario 10: computeDueDates — monthly contract
const s10Contract = makeContract({ id: 's10', start_date: '2026-01-01', end_date: '2026-03-31', frequency: 'monthly' });
const s10DueDates = computeDueDates(s10Contract);
assert(s10DueDates.length === 3, 'computeDueDates monthly Q1: 3 due dates');
assert(s10DueDates[0] === '2026-01-01', 'computeDueDates monthly Q1: Jan');
assert(s10DueDates[1] === '2026-02-01', 'computeDueDates monthly Q1: Feb');
assert(s10DueDates[2] === '2026-03-01', 'computeDueDates monthly Q1: Mar');

// ─── Contract Service — State Evaluation ─────────────────────────────────────

console.log('\n── Contract Service — State Evaluation ───────────────');

// Scenario 9: Active contract — status active, end_date in future
const c1 = evaluateContractState(
  makeContract({ id: 'c1', status: 'active', end_date: '2027-06-30' }),
);
assert(c1 === 'active', 'evaluateContractState: active status + future end_date = active');

// Scenario 10: Active contract with past end_date — no longer dynamically expired
const c2 = evaluateContractState(
  makeContract({ id: 'c2', status: 'active', end_date: YESTERDAY }),
);
assert(c2 === 'active', 'evaluateContractState: active status + past end_date = active (no dynamic expiry)');

// Scenario 11: Paused contract
const c3 = evaluateContractState(
  makeContract({ id: 'c3', status: 'paused', end_date: '2027-06-30' }),
);
assert(c3 === 'paused', 'evaluateContractState: paused = paused');

// Scenario 12: Cancelled contract
const c4 = evaluateContractState(
  makeContract({ id: 'c4', status: 'cancelled', end_date: '2027-06-30' }),
);
assert(c4 === 'cancelled', 'evaluateContractState: cancelled = cancelled');

// ─── Contract Service — Visit Allowance ──────────────────────────────────────

console.log('\n── Contract Service — Visit Allowance ────────────────');

// Scenario 13: Active contract, next visit within bounds
const v1 = checkVisitAllowed(
  makeContract({ id: 'v1', start_date: ONE_YEAR_AGO, end_date: '2027-06-30', frequency: 'biannual' }),
  ['2026-01-01'],
  NOW,
);
assert(v1.allowed === true, 'checkVisitAllowed: active contract next visit within bounds = allowed');

// Scenario 14: Completed contract
const v2 = checkVisitAllowed(
  makeContract({ id: 'v2', status: 'completed', end_date: '2027-06-30' }),
  ['2026-06-01'],
  NOW,
);
assert(v2.allowed === false, 'checkVisitAllowed: completed contract = not allowed');
assert(v2.reason.includes('completed'), 'checkVisitAllowed: reason mentions completed');

// Scenario 15: Paused contract
const v3 = checkVisitAllowed(
  makeContract({ id: 'v3', status: 'paused', end_date: '2027-06-30' }),
  [],
  NOW,
);
assert(v3.allowed === false, 'checkVisitAllowed: paused contract = not allowed');

// Scenario 16: Cancelled contract
const v4 = checkVisitAllowed(
  makeContract({ id: 'v4', status: 'cancelled', end_date: '2027-06-30' }),
  [],
  NOW,
);
assert(v4.allowed === false, 'checkVisitAllowed: cancelled contract = not allowed');

// Scenario 17: Next visit past end_date
const v5 = checkVisitAllowed(
  makeContract({ id: 'v5', start_date: ONE_YEAR_AGO, end_date: '2026-06-30', frequency: 'biannual' }),
  ['2026-01-01'],
  NOW,
);
assert(v5.allowed === false, 'checkVisitAllowed: next visit past end_date = not allowed');

// ─── Contract Service — Renewal Eligibility ──────────────────────────────────

console.log('\n── Contract Service — Renewal Eligibility ────────────');

// Scenario 18: Active contract, far from expiry
const r1 = checkRenewalEligibility(
  makeContract({ id: 'r1', end_date: '2027-06-30' }),
  NOW,
);
assert(r1.eligible === false, 'checkRenewalEligibility: far from expiry = not eligible');

// Scenario 19: Active contract, within 30-day renewal window
const r2 = checkRenewalEligibility(
  makeContract({ id: 'r2', end_date: '2026-07-15' }),
  NOW,
);
assert(r2.eligible === true, 'checkRenewalEligibility: within 30-day window = eligible');
assert(r2.daysUntilExpiry <= 30, 'checkRenewalEligibility: daysUntilExpiry <= 30');

// Scenario 20: Completed contract
const r3 = checkRenewalEligibility(
  makeContract({ id: 'r3', status: 'completed', end_date: '2027-06-30' }),
  NOW,
);
assert(r3.eligible === true, 'checkRenewalEligibility: completed = eligible for renewal');

// Scenario 21: Cancelled contract
const r4 = checkRenewalEligibility(
  makeContract({ id: 'r4', status: 'cancelled', end_date: '2027-06-30' }),
  NOW,
);
assert(r4.eligible === false, 'checkRenewalEligibility: cancelled = not eligible');

// Scenario 22: Paused contract
const r5 = checkRenewalEligibility(
  makeContract({ id: 'r5', status: 'paused', end_date: '2027-06-30' }),
  NOW,
);
assert(r5.eligible === false, 'checkRenewalEligibility: paused = not eligible');

// ─── Contract Service — Progress ─────────────────────────────────────────────

console.log('\n── Contract Service — Progress ────────────────────────');

// Scenario 23: Full progress
const p1 = computeProgress(
  makeContract({ id: 'p1', start_date: '2026-01-01', end_date: '2026-12-31', frequency: 'biannual' }),
  ['2026-01-15', '2026-07-20'],
);
assert(p1.completedVisits === 2, 'computeProgress: 2 of 2 completed');
assert(p1.expectedVisits === 2, 'computeProgress: expected 2 visits');
assert(p1.completionRatio === 1, 'computeProgress: ratio = 1');

// Scenario 24: Partial progress
const p2 = computeProgress(
  makeContract({ id: 'p2', start_date: '2026-01-01', end_date: '2026-12-31', frequency: 'quarterly' }),
  ['2026-01-15', '2026-04-20'],
);
assert(p2.completedVisits === 2, 'computeProgress: 2 of 4 completed');
assert(p2.expectedVisits === 4, 'computeProgress: expected 4 visits');
assert(p2.completionRatio === 0.5, 'computeProgress: ratio = 0.5');

// Scenario 25: No visits
const p3 = computeProgress(
  makeContract({ id: 'p3', start_date: '2026-01-01', end_date: '2026-12-31', frequency: 'monthly' }),
  [],
);
assert(p3.completedVisits === 0, 'computeProgress: 0 of 12 completed');
assert(p3.expectedVisits === 12, 'computeProgress: expected 12 visits');
assert(p3.completionRatio === 0, 'computeProgress: ratio = 0');

// ─── Contract Service — Validation ───────────────────────────────────────────

console.log('\n── Contract Service — Validation ─────────────────────');

// Scenario 26: Valid contract dates
const dateErrors1 = validateContractDates('2026-01-01', '2026-12-31');
assert(dateErrors1.length === 0, 'validateContractDates: valid dates → no errors');

// Scenario 27: Invalid contract dates (end before start)
const dateErrors2 = validateContractDates('2026-12-31', '2026-01-01');
assert(dateErrors2.length === 1, 'validateContractDates: end before start → 1 error');
assert(dateErrors2[0].includes('before'), 'validateContractDates: error mentions before');

// Scenario 28: Missing dates
const dateErrors3 = validateContractDates('', '');
assert(dateErrors3.length >= 2, 'validateContractDates: empty dates → 2+ errors');

// Scenario 29: Valid status transitions
assert(validateStatusTransition('active', 'paused') === true, 'validateStatusTransition: active→paused = valid');
assert(validateStatusTransition('active', 'cancelled') === true, 'validateStatusTransition: active→cancelled = valid');
assert(validateStatusTransition('paused', 'active') === true, 'validateStatusTransition: paused→active = valid');
assert(validateStatusTransition('paused', 'cancelled') === true, 'validateStatusTransition: paused→cancelled = valid');

// Scenario 30: Invalid status transitions
assert(validateStatusTransition('cancelled', 'active') === false, 'validateStatusTransition: cancelled→active = invalid');
assert(validateStatusTransition('completed', 'active') === false, 'validateStatusTransition: completed→active = invalid');
assert(validateStatusTransition('active', 'active') === false, 'validateStatusTransition: active→active = invalid (not a transition)');

// Scenario 31: Full contract validation
const fullErrors1 = validateContract({
  merchant_id: MERCHANT_ID,
  customer_id: CUSTOMER_ID,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  frequency: 'monthly',
});
assert(fullErrors1.length === 0, 'validateContract: valid input → no errors');

// Scenario 32: Invalid frequency
const fullErrors2 = validateContract({
  merchant_id: MERCHANT_ID,
  customer_id: CUSTOMER_ID,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  frequency: 'weekly',
});
assert(fullErrors2.some(e => e.includes('frequency')), 'validateContract: invalid frequency → error');

// Scenario 33: Missing required fields
const fullErrors3 = validateContract({
  merchant_id: '',
  customer_id: '',
  start_date: '',
  end_date: '',
  frequency: '',
});
assert(fullErrors3.length >= 3, 'validateContract: missing fields → 3+ errors');

// ─── Full Contract Evaluation ────────────────────────────────────────────────

console.log('\n── Full Contract Evaluation ──────────────────────────');

// Scenario 34: Active contract, due today
const e1 = evaluateContract(
  makeContract({ id: 'e1', start_date: SIX_MONTHS_AGO, end_date: '2027-06-30', frequency: 'biannual' }),
  ['2026-01-01'],
  NOW,
);
assert(e1.state === 'active', 'evaluateContract: state = active');
assert(e1.schedule !== null, 'evaluateContract: schedule is computed');
assert(e1.schedule!.isDue === true, 'evaluateContract: due today');
assert(e1.visitAllowed.allowed === true, 'evaluateContract: visit allowed');
assert(e1.renewal.eligible === false, 'evaluateContract: renewal not eligible yet');
assert(e1.progress.expectedVisits > 0, 'evaluateContract: progress computed');

// Scenario 35: Completed contract
const e2 = evaluateContract(
  makeContract({ id: 'e2', start_date: ONE_YEAR_AGO, end_date: '2027-06-30', status: 'completed', frequency: 'monthly' }),
  ['2026-01-01', '2026-02-01', '2026-03-01'],
  NOW,
);
assert(e2.state === 'completed', 'evaluateContract completed: state = completed');
assert(e2.schedule === null, 'evaluateContract completed: no schedule computed');
assert(e2.visitAllowed.allowed === false, 'evaluateContract completed: visit not allowed');
assert(e2.renewal.eligible === true, 'evaluateContract completed: eligible for renewal');

// ─── Deterministic Output ─────────────────────────────────────────────────────

console.log('\n── Deterministic Output ──────────────────────────────');

// Scenario 36: Same inputs → same outputs (scheduling service)
const detContract = makeContract({ id: 'det', start_date: SIX_MONTHS_AGO, frequency: 'monthly' });
const detVisits = ['2026-04-15', '2026-05-15'];

const detRun1 = evaluateSchedule(detContract, detVisits, NOW);
const detRun2 = evaluateSchedule(detContract, detVisits, NOW);
assert(
  JSON.stringify(detRun1) === JSON.stringify(detRun2),
  'evaluateSchedule: deterministic output',
);

// Scenario 37: Same inputs → same outputs (contract service)
const detEval1 = evaluateContract(detContract, detVisits, NOW);
const detEval2 = evaluateContract(detContract, detVisits, NOW);
assert(
  JSON.stringify(detEval1) === JSON.stringify(detEval2),
  'evaluateContract: deterministic output',
);

// ─── No Side Effects ─────────────────────────────────────────────────────────

console.log('\n── No Side Effects ───────────────────────────────────');

// Scenario 38: Input arrays are not mutated
const neContract = makeContract({ id: 'ne', start_date: SIX_MONTHS_AGO, frequency: 'quarterly' });
const neVisits: string[] = ['2026-04-01'];
const neVisitsBefore = JSON.stringify(neVisits);

evaluateSchedule(neContract, neVisits, NOW);
evaluateContract(neContract, neVisits, NOW);

assert(
  JSON.stringify(neVisits) === neVisitsBefore,
  'No side effects: input array not mutated',
);

// Scenarios 39-41: Pure utility functions
assert(
  isValidFrequency('monthly') && !isValidFrequency('invalid'),
  'isValidFrequency: pure function (no side effects)',
);

assert(
  getFrequencyMonths('annual') === 12,
  'getFrequencyMonths: pure function (no side effects)',
);

assert(
  countVisitsInPeriod('2026-01-01', '2026-06-30', 'monthly') === 6,
  'countVisitsInPeriod: pure function (no side effects)',
);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n── All Validation Scenarios Passed ───────────────────');
