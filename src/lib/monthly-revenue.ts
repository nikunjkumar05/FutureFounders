import { estimateServiceValue } from './customer-intelligence';
import type { ServiceCardWithDetails } from './types';

export interface MonthlyRevenueResult {
  totalRevenue: number;
  completedJobCount: number;
  year: number;
  month: number;
}

export function calculateMonthlyRevenue(
  cards: ServiceCardWithDetails[],
  year: number,
  month: number,
): MonthlyRevenueResult {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  let totalRevenue = 0;
  let completedJobCount = 0;

  for (const card of cards) {
    if (card.job_status !== 'completed') continue;
    if (!card.service_date.startsWith(prefix)) continue;

    completedJobCount++;
    totalRevenue += estimateServiceValue(card);
  }

  return {
    totalRevenue,
    completedJobCount,
    year,
    month,
  };
}
