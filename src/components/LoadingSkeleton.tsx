export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="p-4 border-b border-surface-100 dark:border-surface-700/50">
        <div className="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
      </div>
      <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-4 bg-surface-150 dark:bg-surface-600 rounded animate-pulse flex-1"
                style={{ width: `${100 / cols}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-6 animate-pulse">
      <div className="h-4 w-24 bg-surface-200 dark:bg-surface-700 rounded mb-3" />
      <div className="h-8 w-16 bg-surface-200 dark:bg-surface-700 rounded mb-2" />
      <div className="h-3 w-20 bg-surface-150 dark:bg-surface-600 rounded" />
    </div>
  );
}
