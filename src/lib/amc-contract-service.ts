import { isAfter, parseISO, startOfDay } from 'date-fns';
import type { AmcContract, AmcContractStatus } from './types';
import type {
  AmcContractState,
  AmcContractEvaluation,
  AmcVisitAllowance,
  AmcRenewalEvaluation,
  AmcProgress,
} from './amc-types';
import { evaluateSchedule } from './amc-scheduling';
import {
  isDatePast,
  isValidFrequency,
  countVisitsInPeriod,
} from './amc-utils';

// NOTE: Contract expiry semantics are an unresolved product decision.
// Currently, an active contract past its end_date is evaluated as "expired".
// The business rule may change to use visit completion, merchant action,
// or another trigger. Revisit during AMC lifecycle implementation.
export function evaluateContractState(
  contract: AmcContract,
  today: Date,
): AmcContractState {
  if (contract.status === 'active') {
    if (isDatePast(contract.end_date, today)) {
      return 'expired';
    }
    return 'active';
  }
  return contract.status;
}

export function checkVisitAllowed(
  contract: AmcContract,
  completedVisitDates: string[],
  today: Date,
): AmcVisitAllowance {
  const state = evaluateContractState(contract, today);

  if (state !== 'active') {
    return { allowed: false, reason: `Contract is ${state}` };
  }

  const schedule = evaluateSchedule(contract, completedVisitDates, today);
  const nextStart = startOfDay(parseISO(schedule.nextVisitDate));
  const endStart = startOfDay(parseISO(contract.end_date));

  if (isAfter(nextStart, endStart)) {
    return { allowed: false, reason: 'Next visit would fall after contract end_date' };
  }

  return { allowed: true, reason: 'Visit is allowed under active contract' };
}

export function checkRenewalEligibility(
  contract: AmcContract,
  today: Date,
): AmcRenewalEvaluation {
  const state = evaluateContractState(contract, today);
  const todayStart = startOfDay(today);
  const endStart = startOfDay(parseISO(contract.end_date));

  if (state === 'cancelled') {
    return { eligible: false, daysUntilExpiry: 0, reason: 'Contract is cancelled' };
  }

  if (state === 'paused') {
    return { eligible: false, daysUntilExpiry: 0, reason: 'Contract is paused' };
  }

  const isExpired = !isAfter(endStart, todayStart);
  const diffDays = Math.round(
    (endStart.getTime() - todayStart.getTime()) / 86400000,
  );

  if (isExpired) {
    return { eligible: true, daysUntilExpiry: diffDays, reason: 'Contract has expired — renewal recommended' };
  }

  // NOTE: 30-day renewal window is an implementation assumption, not a
  // finalized business rule. Confirm during Renewal/Attention implementation.
  if (diffDays <= 30) {
    return { eligible: true, daysUntilExpiry: diffDays, reason: `Contract expires in ${diffDays} days — within renewal window` };
  }

  return { eligible: false, daysUntilExpiry: diffDays, reason: `Contract expires in ${diffDays} days — not yet in renewal window` };
}

export function computeProgress(
  contract: AmcContract,
  completedVisitDates: string[],
): AmcProgress {
  const expectedVisits = countVisitsInPeriod(
    contract.start_date,
    contract.end_date,
    contract.frequency,
  );
  const completedVisits = Math.min(completedVisitDates.length, expectedVisits);

  return {
    completedVisits,
    expectedVisits,
    completionRatio: expectedVisits > 0 ? completedVisits / expectedVisits : 0,
  };
}

export function evaluateContract(
  contract: AmcContract,
  completedVisitDates: string[],
  today: Date,
): AmcContractEvaluation {
  const state = evaluateContractState(contract, today);
  const schedule = state === 'active'
    ? evaluateSchedule(contract, completedVisitDates, today)
    : null;
  const visitAllowed = checkVisitAllowed(contract, completedVisitDates, today);
  const renewal = checkRenewalEligibility(contract, today);
  const progress = computeProgress(contract, completedVisitDates);

  return {
    contract,
    state,
    schedule,
    visitAllowed,
    renewal,
    progress,
  };
}

export function validateContractDates(
  startDate: string,
  endDate: string,
): string[] {
  const errors: string[] = [];

  if (!startDate) {
    errors.push('start_date is required');
  }
  if (!endDate) {
    errors.push('end_date is required');
  }
  if (startDate && endDate) {
    if (endDate < startDate) {
      errors.push('end_date must not be before start_date');
    }
  }

  return errors;
}

const VALID_TRANSITIONS: Record<AmcContractStatus, AmcContractStatus[]> = {
  active: ['paused', 'cancelled', 'expired'],
  paused: ['active', 'cancelled'],
  cancelled: [],
  expired: [],
};

export function validateStatusTransition(
  from: AmcContractStatus,
  to: AmcContractStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateContract(
  input: {
    merchant_id: string;
    customer_id: string;
    start_date: string;
    end_date: string;
    frequency: string;
    service_template?: Record<string, unknown>;
    notes?: string | null;
  },
): string[] {
  const errors: string[] = [];

  if (!input.merchant_id) errors.push('merchant_id is required');
  if (!input.customer_id) errors.push('customer_id is required');

  errors.push(...validateContractDates(input.start_date, input.end_date));

  if (!input.frequency) {
    errors.push('frequency is required');
  } else if (!isValidFrequency(input.frequency)) {
    errors.push(`invalid frequency: "${input.frequency}" — must be one of: monthly, quarterly, biannual, annual`);
  }

  return errors;
}
