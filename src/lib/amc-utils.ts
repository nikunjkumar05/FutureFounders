import { addMonths, differenceInDays, differenceInCalendarMonths, parseISO, format, isAfter, startOfDay, isBefore } from 'date-fns';
import type { AmcFrequency } from './types';
import type { AmcFrequencyConfig } from './amc-types';

export const FREQUENCY_CONFIGS: Record<AmcFrequency, AmcFrequencyConfig> = {
  monthly:  { frequency: 'monthly',  months: 1,  approximateDays: 30,  label: 'Monthly' },
  quarterly: { frequency: 'quarterly', months: 3,  approximateDays: 91,  label: 'Quarterly' },
  biannual: { frequency: 'biannual', months: 6,  approximateDays: 182, label: 'Biannual' },
  annual:   { frequency: 'annual',   months: 12, approximateDays: 365, label: 'Annual' },
};

export function getFrequencyMonths(frequency: AmcFrequency): number {
  return FREQUENCY_CONFIGS[frequency].months;
}

export function getApproximateIntervalDays(frequency: AmcFrequency): number {
  return FREQUENCY_CONFIGS[frequency].approximateDays;
}

export function toDate(dateStr: string): Date {
  return startOfDay(parseISO(dateStr));
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function addInterval(dateStr: string, frequency: AmcFrequency): string {
  const months = getFrequencyMonths(frequency);
  return formatDate(addMonths(toDate(dateStr), months));
}

export function daysBetween(from: string, to: string | Date): number {
  const toDateObj = typeof to === 'string' ? toDate(to) : startOfDay(to);
  return differenceInDays(toDateObj, toDate(from));
}

export function isDatePast(dateStr: string, today: Date): boolean {
  return isBefore(toDate(dateStr), startOfDay(today));
}

export function isDateFuture(dateStr: string, today: Date): boolean {
  return isAfter(toDate(dateStr), startOfDay(today));
}

export function earliestDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function latestDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function isValidFrequency(value: string): value is AmcFrequency {
  return ['monthly', 'quarterly', 'biannual', 'annual'].includes(value);
}

export function countVisitsInPeriod(
  startDate: string,
  endDate: string,
  frequency: AmcFrequency,
): number {
  const months = getFrequencyMonths(frequency);
  const diffMonths = differenceInCalendarMonths(toDate(endDate), toDate(startDate));
  return Math.floor(diffMonths / months) + 1;
}
