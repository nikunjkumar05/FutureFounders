import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format, parseISO, isWithinInterval } from 'date-fns';

export type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All' },
];

export function getDateRange(period: TimePeriod): { start: Date; end: Date } | null {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'all':
      return null;
  }
}

export function isInRange(dateStr: string, period: TimePeriod): boolean {
  if (period === 'all') return true;
  const range = getDateRange(period);
  if (!range) return true;
  return isWithinInterval(parseISO(dateStr), range);
}

export function formatMonthYear(dateStr: string): string {
  return format(parseISO(dateStr), 'MMMM yyyy');
}

export function groupByMonthYear<T>(items: T[], getDate: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = formatMonthYear(getDate(item));
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}
