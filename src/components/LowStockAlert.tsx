import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStockAlerts, useResolveAlert } from '../lib/queries';
import { supabase } from '../lib/supabase';
import { CheckCircle, Package } from 'lucide-react';

export function LowStockAlert() {
  const { data: alerts } = useStockAlerts();
  const resolveAlert = useResolveAlert();
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel('low-stock-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stock_alerts' },
          () => qc.invalidateQueries({ queryKey: ['stock_alerts'] })
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'inventory' },
          () => qc.invalidateQueries({ queryKey: ['stock_alerts'] })
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [qc]);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="lg:ml-64">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-800/30 px-4 py-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5 text-red-800 dark:text-red-200 text-sm">
            <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/50">
              <Package size={14} className="text-red-600 dark:text-red-400" />
            </div>
            <span className="font-medium">
              {alert.inventory?.item_name}
            </span>
            <span className="text-red-600 dark:text-red-400">
              {alert.inventory?.current_stock}{alert.inventory?.unit} left
            </span>
            <span className="hidden sm:inline text-red-400 dark:text-red-500">
              (min: {alert.inventory?.minimum_threshold}{alert.inventory?.unit})
            </span>
          </div>
          <button
            onClick={() => resolveAlert.mutate({ alertId: alert.id, inventoryId: alert.inventory_id, merchantId: alert.merchant_id })}
            className="flex items-center gap-1.5 text-xs font-display font-semibold text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <CheckCircle size={14} />
            Reordered
          </button>
        </div>
      ))}
    </div>
  );
}
