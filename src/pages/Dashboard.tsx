import {
  Package,
  TrendingUp,
  CircleDot,
  Kanban,
  Briefcase,
  ChevronRight,
  Users,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useDashboardMetrics, useTimeSavedMetrics, useDailyBriefing } from '../lib/queries';
import { calculateTotalMinutes, formatMinutes } from '../lib/timeSaved';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { Suspense, lazy, memo, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import TankRing from '../components/TankRing';
import RevenueIntelligence from '../components/RevenueIntelligence';
import { trackEvent } from '../lib/analytics';

const DailyBriefingModal = lazy(() => import('../components/DailyBriefing'));

export default function Dashboard() {
  const { data, isLoading } = useDashboardMetrics();
  const { data: timeData } = useTimeSavedMetrics();
  const { data: briefing } = useDailyBriefing();
  const [showBriefing, setShowBriefing] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    trackEvent('dashboard_viewed');
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel('dashboard-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'service_cards' },
          () => {
            qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
            qc.invalidateQueries({ queryKey: ['time_saved_metrics'] });
          }
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
          () => {
            qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
            qc.invalidateQueries({ queryKey: ['time_saved_metrics'] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminder_responses' },
          () => {
            qc.invalidateQueries({ queryKey: ['revenue_intelligence'] });
            qc.invalidateQueries({ queryKey: ['time_saved_metrics'] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          () => qc.invalidateQueries({ queryKey: ['time_saved_metrics'] })
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customer_intelligence' },
          () => qc.invalidateQueries({ queryKey: ['revenue_intelligence'] })
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [qc]);

  const completedToday = data?.jobsCompletedThisWeek ?? 0;
  const monthlyTarget = 30;
  const pendingJobs = data?.pendingJobs ?? 0;
  const inProgressJobs = data?.inProgressJobs ?? 0;
  const staffCheckedIn = data?.staffCheckedIn ?? 0;
  const lowStockAlerts = data?.lowStockAlerts ?? 0;
  const timeSavedValue = timeData ? formatMinutes(calculateTotalMinutes(timeData)) : '0m';


  return (
    <div className="space-y-6">
      {/* Hero: Today's Pulse */}
      <div className="card-base p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-50 to-cyan-50 dark:from-navy-950/30 dark:to-cyan-950/30" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-display font-medium text-navy-600 dark:text-cyan-400">
              Today's pulse
            </p>
            <h1 className="text-display-lg font-display text-navy-900 dark:text-surface-100">
              {completedToday} tank{completedToday !== 1 ? 's' : ''} cleaned
            </h1>
            <p className="text-body-sm text-surface-500 dark:text-surface-400">
              {staffCheckedIn} crew on site · {pendingJobs + inProgressJobs} jobs active
            </p>
          </div>
          <div className="shrink-0">
            <TankRing current={completedToday} target={monthlyTarget} size={80} strokeWidth={6} />
          </div>
        </div>

        {/* Quick summary row */}
        <div className="relative mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => setShowBriefing(true)}
            className="btn-primary"
          >
            <Briefcase size={16} />
            Today's briefing
            {briefing && (
              <span className="ml-1 text-cyan-200 font-mono text-xs">
                {briefing.jobs.total} jobs
              </span>
            )}
          </button>
          <div className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
            <span className="flex items-center gap-1.5">
              <CircleDot size={12} className="text-amber-500" />
              {pendingJobs} pending
            </span>
            <span className="text-surface-300 dark:text-surface-600">·</span>
            <span className="flex items-center gap-1.5">
              <Kanban size={12} className="text-cyan-500" />
              {inProgressJobs} in progress
            </span>
            {lowStockAlerts > 0 && (
              <>
                <span className="text-surface-300 dark:text-surface-600">·</span>
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-red-500" />
                  {lowStockAlerts} low stock
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics - 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : (
            <>
              <MetricCard
                label="Pending jobs"
                value={pendingJobs}
                icon={CircleDot}
                color="amber"
                trend={`${inProgressJobs} in progress`}
              />
              <MetricCard
                label="Crew checked in"
                value={staffCheckedIn}
                icon={Users}
                color="cyan"
                trend="Today"
              />
              <MetricCard
                label="Low stock items"
                value={lowStockAlerts}
                icon={Package}
                color={lowStockAlerts > 0 ? 'red' : 'surface'}
                trend={lowStockAlerts > 0 ? 'Needs attention' : 'All stocked'}
              />
              <MetricCard
                label="Time saved this month"
                value={timeSavedValue}
                icon={Clock}
                color="cyan"
                trend="Based on actual activity"
              />
            </>
          )}
      </div>

      {/* Quick Actions + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <QuickActions />
        <SystemStatus />
      </div>

      {/* Revenue Intelligence */}
      <div className="card-base p-5">
        <RevenueIntelligence />
      </div>

      {showBriefing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="animate-spin w-6 h-6 border-2 border-navy-500 border-t-transparent rounded-full" /></div>}>
          <DailyBriefingModal onClose={() => setShowBriefing(false)} />
        </Suspense>
      )}
    </div>
  );
}

const MetricCard = memo(function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: number | string;
  icon: typeof CircleDot;
  color: 'cyan' | 'amber' | 'red' | 'surface';
  trend: string;
}) {
  const colorMap = {
    cyan: {
      bg: 'bg-cyan-50 dark:bg-cyan-950/50',
      icon: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
      value: 'text-cyan-700 dark:text-cyan-300',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/50',
      icon: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
      value: 'text-amber-700 dark:text-amber-300',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950/50',
      icon: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
      value: 'text-red-700 dark:text-red-300',
    },
    surface: {
      bg: 'bg-surface-50 dark:bg-surface-800/50',
      icon: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400',
      value: 'text-surface-700 dark:text-surface-300',
    },
  };

  const styles = colorMap[color];

  return (
    <div className={`metric-card ${styles.bg}`}>
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-display font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">
            {label}
          </p>
          <p className={`text-display-md font-display ${styles.value} mt-1`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-xl ${styles.icon}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="relative mt-3 flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400">
        <TrendingUp size={12} />
        {trend}
      </div>
    </div>
  );
});

const QuickActions = memo(function QuickActions() {
  return (
    <div className="card-base p-5">
      <h2 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100 mb-3">
        Quick actions
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Schedule cleaning', to: '/jobs' },
          { label: 'Check supplies', to: '/inventory' },
          { label: 'Send reminders', to: '/customers' },
          { label: 'Log shifts', to: '/attendance' },
        ].map(({ label, to }) => (
          <a
            key={label}
            href={to}
            className={`group flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-surface-200 dark:border-surface-700
              text-sm font-medium text-surface-700 dark:text-surface-300
              hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700
              dark:hover:border-cyan-700 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-300
              transition-all duration-150`}
          >
            <span className="flex-1">{label}</span>
            <ChevronRight size={14} className="text-surface-400 group-hover:text-current transition-colors" />
          </a>
        ))}
      </div>
    </div>
  );
});

const SystemStatus = memo(function SystemStatus() {
  return (
    <div className="card-base p-5">
      <h2 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100 mb-3">
        System status
      </h2>
      <div className="space-y-2">
        {[
          { label: 'WhatsApp integration', status: 'Connected', active: true },
          { label: 'Inventory auto-deduct', status: 'Active', active: true },
          { label: '180-day reminder cron', status: 'Scheduled', active: true },
          { label: 'AI FAQ responder', status: 'Active', active: true },
        ].map(({ label, status, active }) => (
          <div
            key={label}
            className="flex items-center justify-between py-2 px-3 rounded-xl bg-surface-50 dark:bg-surface-800/50"
          >
            <span className="text-sm text-surface-700 dark:text-surface-300">{label}</span>
            <span className={active ? 'badge-ok' : 'badge-neutral'}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
