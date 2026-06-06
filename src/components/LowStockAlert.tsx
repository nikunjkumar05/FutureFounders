import { useStockAlerts, useResolveAlert } from '../lib/queries';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export function LowStockAlert() {
  const { data: alerts } = useStockAlerts();
  const resolveAlert = useResolveAlert();

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="lg:ml-64">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2 text-red-800 text-sm font-medium">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <span>
              Low Stock: {alert.inventory?.item_name} — Only{' '}
              {alert.inventory?.current_stock}
              {alert.inventory?.unit} remaining (Min:{' '}
              {alert.inventory?.minimum_threshold}
              {alert.inventory?.unit})
            </span>
          </div>
          <button
            onClick={() => resolveAlert.mutate({ alertId: alert.id })}
            className="flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1 rounded-md transition-colors"
          >
            <CheckCircle size={14} />
            Mark Reordered
          </button>
        </div>
      ))}
    </div>
  );
}
