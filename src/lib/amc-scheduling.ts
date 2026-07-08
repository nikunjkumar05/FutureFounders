import { addMonths, isAfter, parseISO, startOfDay, format, differenceInDays } from 'date-fns';
import type { AmcContract } from './types';
import type { AmcScheduleResult } from './amc-types';
import {
  addInterval,
  formatDate,
  getFrequencyMonths,
} from './amc-utils';

export function computeNextVisitDate(
  contract: AmcContract,
  completedVisitDates: string[],
): string {
  if (completedVisitDates.length === 0) {
    return formatDate(startOfDay(parseISO(contract.start_date)));
  }

  const sorted = [...completedVisitDates].sort();
  const lastVisitDate = sorted[sorted.length - 1];
  return addInterval(lastVisitDate, contract.frequency);
}

export function evaluateSchedule(
  contract: AmcContract,
  completedVisitDates: string[],
  today: Date,
): AmcScheduleResult {
  const nextVisitDate = computeNextVisitDate(contract, completedVisitDates);
  const todayStart = startOfDay(today);
  const nextStart = startOfDay(parseISO(nextVisitDate));

  const isOverdue = isAfter(todayStart, nextStart);
  const isDue = !isAfter(nextStart, todayStart);

  return {
    nextVisitDate,
    daysUntilDue: differenceInDays(nextStart, todayStart),
    isDue,
    isOverdue,
    daysOverdue: isOverdue ? differenceInDays(todayStart, nextStart) : 0,
  };
}

export function computeDueDates(
  contract: AmcContract,
  today?: Date,
): string[] {
  const months = getFrequencyMonths(contract.frequency);
  const dates: string[] = [];
  let current = parseISO(contract.start_date);
  const end = parseISO(contract.end_date);

  if (today) {
    current = isAfter(current, startOfDay(today)) ? current : startOfDay(today);
  }

  while (!isAfter(current, end)) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addMonths(current, months);
  }

  return dates;
}
