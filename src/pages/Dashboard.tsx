import {
  Bell,
  Package,
  Clock,
  CheckCircle2,
  TrendingUp,
  Droplets,
} from 'lucide-react';
import { useDashboardMetrics } from '../lib/queries';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

const metrics = [
  {
    key: 'dueReminders' as const,
    label: 'Due Reminders Today',
    icon: Bell,
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    iconBg: 'bg-amber-100',
  },
  {
    key: 'lowStockAlerts' as const,
    label: 'Low Stock Alerts',
    icon: Package,
    color: 'bg-red-50 text-red-600 border-red-200',
    iconBg: 'bg-red-100',
  },
  {
    key: 'staffCheckedIn' as const,
    label: 'Staff Checked In Today',
    icon: Clock,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    iconBg: 'bg-blue-100',
  },
  {
    key: 'jobsCompletedThisWeek' as const,
    label: 'Jobs Completed This Week',
    icon: CheckCircle2,
    color: 'bg-green-50 text-green-600 border-green-200',
    iconBg: 'bg-green-100',
  },
];

export default function Dashboard() {
  const { data, isLoading } = useDashboardMetrics();
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel('dashboard-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'service_cards' },
          () => qc.invalidateQueries({ queryKey: ['dashboard_metrics'] })
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stock_alerts' },
          () => qc.invalidateQueries({ queryKey: ['dashboard_metrics'] })
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          () => qc.invalidateQueries({ queryKey: ['dashboard_metrics'] })
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          () => qc.invalidateQueries({ queryKey: ['dashboard_metrics'] })
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [qc]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Droplets size={28} className="text-blue-600" />
          Dashboard
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Welcome back, Sunil. Here's your business at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : metrics.map(({ key, label, icon: Icon, color, iconBg }) => (
              <div
                key={key}
                className={`rounded-xl border p-5 ${color} transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium opacity-80 uppercase tracking-wide">
                      {label}
                    </p>
                    <p className="text-3xl font-bold mt-2">
                      {data?.[key] ?? 0}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${iconBg}`}>
                    <Icon size={20} />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 text-xs opacity-70">
                  <TrendingUp size={12} />
                  Live updates
                </div>
              </div>
            ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickActions />
        <RecentActivity />
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Send Reminders', to: '/customers', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200' },
          { label: 'Check Inventory', to: '/inventory', color: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200' },
          { label: 'Manage Jobs', to: '/jobs', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' },
          { label: 'Staff Attendance', to: '/attendance', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200' },
        ].map(({ label, to, color }) => (
          <a
            key={label}
            href={to}
            className={`text-sm font-medium px-4 py-3 rounded-lg border transition-colors text-center ${color}`}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function RecentActivity() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">
        System Status
      </h2>
      <div className="space-y-3">
        {[
          { label: 'WhatsApp Integration', status: 'Configured', active: true },
          { label: 'Inventory Auto-Deduct', status: 'Active', active: true },
          { label: '180-Day Reminder Cron', status: 'Scheduled', active: true },
          { label: 'AI FAQ Responder', status: 'Active', active: true },
        ].map(({ label, status, active }) => (
          <div
            key={label}
            className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50"
          >
            <span className="text-sm text-slate-700">{label}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
