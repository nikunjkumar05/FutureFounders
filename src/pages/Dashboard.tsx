import {
  Bell,
  Package,
  Clock,
  CheckCircle2,
  TrendingUp,
  CircleDot,
  Kanban,
  Droplets,
  Briefcase,
  ChevronRight,
  Sun,
} from 'lucide-react';
import { useDashboardMetrics, useDailyBriefing } from '../lib/queries';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import DailyBriefingModal from '../components/DailyBriefing';

const metrics = [
  {
    key: 'pendingJobs' as const,
    label: 'Pending Jobs',
    icon: CircleDot,
    color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  {
    key: 'inProgressJobs' as const,
    label: 'In Progress',
    icon: Kanban,
    color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
  {
    key: 'jobsCompletedThisWeek' as const,
    label: 'Completed This Week',
    icon: CheckCircle2,
    color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
    iconBg: 'bg-green-100 dark:bg-green-900/50',
  },
  {
    key: 'dueReminders' as const,
    label: 'Due Reminders',
    icon: Bell,
    color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  {
    key: 'lowStockAlerts' as const,
    label: 'Low Stock Alerts',
    icon: Package,
    color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/50',
  },
  {
    key: 'staffCheckedIn' as const,
    label: 'Staff Checked In Today',
    icon: Clock,
    color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
];

export default function Dashboard() {
  const { data, isLoading } = useDashboardMetrics();
  const { data: briefing } = useDailyBriefing();
  const [showBriefing, setShowBriefing] = useState(false);
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Droplets size={28} className="text-blue-600" />
          Dashboard
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Welcome back, Sunil. Here's your business at a glance.
        </p>
      </div>

      <button
        onClick={() => setShowBriefing(true)}
        className="w-full mb-6 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-5 text-left text-white shadow-lg hover:shadow-xl transition-all hover:from-blue-700 hover:to-indigo-800"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-lg">
              <Briefcase size={24} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold">Today's Briefing</p>
              <p className="text-sm text-blue-100 mt-0.5">
                {briefing
                  ? `${briefing.jobs.total} jobs · ${briefing.workers.checkedIn}/${briefing.workers.totalActive} workers · ${briefing.inventoryAlerts.length} alerts`
                  : 'Loading summary...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-blue-100">
            <Sun size={16} />
            <ChevronRight size={20} />
          </div>
        </div>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
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

      {showBriefing && <DailyBriefingModal onClose={() => setShowBriefing(false)} />}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Create Job', to: '/jobs', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-blue-200 dark:border-blue-800' },
          { label: 'Check Inventory', to: '/inventory', color: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 border-green-200 dark:border-green-800' },
          { label: 'Send Reminders', to: '/customers', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800' },
          { label: 'Staff Attendance', to: '/attendance', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 border-purple-200 dark:border-purple-800' },
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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
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
            className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/50"
          >
            <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                active
                  ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
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
