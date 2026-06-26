import { type TimePeriod, TIME_PERIOD_OPTIONS } from '../lib/timeUtils';

export default function TimeFilter({
  value,
  onChange,
}: {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {TIME_PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-display font-medium rounded-lg transition-colors ${
            value === opt.value
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
