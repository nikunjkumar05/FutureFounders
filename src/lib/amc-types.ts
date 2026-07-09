import type { AmcContract, AmcFrequency } from './types';

export type AmcContractState = 'active' | 'paused' | 'cancelled' | 'completed';

export interface AmcScheduleResult {
  nextVisitDate: string;
  daysUntilDue: number;
  isDue: boolean;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface AmcVisitAllowance {
  allowed: boolean;
  reason: string;
}

export interface AmcRenewalEvaluation {
  eligible: boolean;
  daysUntilExpiry: number;
  reason: string;
}

export interface AmcProgress {
  completedVisits: number;
  expectedVisits: number;
  completionRatio: number;
}

export interface AmcContractEvaluation {
  contract: AmcContract;
  state: AmcContractState;
  schedule: AmcScheduleResult | null;
  visitAllowed: AmcVisitAllowance;
  renewal: AmcRenewalEvaluation;
  progress: AmcProgress;
}

export interface AmcFrequencyConfig {
  frequency: AmcFrequency;
  months: number;
  approximateDays: number;
  label: string;
}
