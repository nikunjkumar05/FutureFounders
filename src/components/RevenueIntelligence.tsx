import { useRevenueIntelligence } from '../lib/queries';
import type { SegmentedCustomer } from '../lib/types';
import {
  TrendingUp,
  Users,
  MessageSquare,
  Clock,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Lightbulb,
  Phone,
  UserCheck,
  UserX,
} from 'lucide-react';

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export default function RevenueIntelligence() {
  const { data, isLoading } = useRevenueIntelligence();

  if (isLoading) {
    return (
      <div className="card-base p-5 space-y-4">
        <div className="h-5 w-48 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-100 dark:bg-surface-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const metrics = [
    {
      label: 'Potential Revenue Due',
      value: formatINR(data.potentialRevenueDueThisMonth),
      icon: DollarSign,
      color: 'emerald',
      sub: 'This month',
    },
    {
      label: 'Customers Due',
      value: data.customersDue,
      icon: Users,
      color: 'cyan',
      sub: 'Ready for booking',
    },
    {
      label: 'Responded',
      value: data.respondedToReminder,
      icon: MessageSquare,
      color: 'blue',
      sub: 'Replied to reminders',
    },
    {
      label: 'Awaiting Follow-Up',
      value: data.awaitingFollowUp,
      icon: Clock,
      color: 'amber',
      sub: 'Reminder sent, no reply',
    },
    {
      label: 'High Churn Risk',
      value: data.highChurnRisk,
      icon: AlertTriangle,
      color: 'red',
      sub: 'Overdue & unresponsive',
    },
    {
      label: 'Recoverable Revenue',
      value: formatINR(data.potentialRevenueRecovery),
      icon: TrendingUp,
      color: 'rose',
      sub: 'At-risk customers',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-100 to-cyan-100 dark:from-emerald-900/30 dark:to-cyan-900/30">
          <BarChart3 size={18} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100">
          Revenue Intelligence
        </h2>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <MetricTile key={m.label} {...m} />
        ))}
      </div>

      {/* Monthly Revenue Forecast Widget */}
      <div className="card-base p-4 border border-surface-200 dark:border-surface-700 bg-gradient-to-r from-navy-50/50 to-cyan-50/50 dark:from-navy-950/20 dark:to-cyan-950/20">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-cyan-500" />
          <h3 className="text-xs font-display font-semibold text-navy-900 dark:text-surface-100 uppercase tracking-wide">
            Monthly Revenue Forecast
          </h3>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-surface-700 dark:text-surface-300 font-medium">
              This month: <span className="text-navy-900 dark:text-white font-bold">{data.forecast?.jobsCount || 0} jobs due</span> = <span className="text-cyan-600 dark:text-cyan-400 font-bold">{formatINR(data.forecast?.expected || 0)} expected</span>
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              Confirmed: {formatINR(data.forecast?.confirmed || 0)}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              At Risk: {formatINR(data.forecast?.atRisk || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Reminder Analytics */}
      <div className="card-base p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-indigo-500" />
          <h3 className="text-xs font-display font-semibold text-navy-900 dark:text-surface-100 uppercase tracking-wide">
            Reminder Analytics
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AnalyticTile label="Reminders Sent" value={data.reminderAnalytics.totalSent} />
          <AnalyticTile label="Responses" value={data.reminderAnalytics.responses} />
          <AnalyticTile label="Bookings Generated" value={data.reminderAnalytics.bookingsGenerated} />
          <AnalyticTile label="Conversion Rate" value={`${data.reminderAnalytics.conversionRate}%`} />
        </div>
      </div>

      {/* Customer Segments */}
      <div className="space-y-3">
        <ReadyToBookSection customers={data.segments.readyToBook} />
        <FollowUpSection customers={data.segments.followUpNeeded} />
        <ChurnRiskSection customers={data.segments.highChurnRisk} />
      </div>

      {/* Insights */}
      {data.insights.length > 0 && (
        <div className="card-base p-4 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} className="text-amber-500" />
            <h3 className="text-xs font-display font-semibold text-navy-900 dark:text-surface-100 uppercase tracking-wide">
              Insights
            </h3>
          </div>
          <ul className="space-y-1.5">
            {data.insights.map((insight, i) => (
              <li key={i} className="text-sm text-surface-700 dark:text-surface-300 flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value, icon: Icon, color, sub }: {
  label: string;
  value: string | number;
  icon: typeof DollarSign;
  color: string;
  sub: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/50',
      icon: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    cyan: {
      bg: 'bg-cyan-50 dark:bg-cyan-950/50',
      icon: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
      text: 'text-cyan-700 dark:text-cyan-300',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      icon: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
      text: 'text-blue-700 dark:text-blue-300',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/50',
      icon: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
      text: 'text-amber-700 dark:text-amber-300',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950/50',
      icon: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
      text: 'text-red-700 dark:text-red-300',
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-950/50',
      icon: 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400',
      text: 'text-rose-700 dark:text-rose-300',
    },
  };

  const styles = colorMap[color];

  return (
    <div className={`rounded-xl p-3.5 ${styles.bg} border border-transparent`}>
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-[11px] font-display font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider leading-tight max-w-[120px]">
          {label}
        </p>
        <div className={`p-1.5 rounded-lg ${styles.icon}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className={`text-display-sm font-display font-bold ${styles.text}`}>
        {value}
      </p>
      <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-0.5">
        {sub}
      </p>
    </div>
  );
}

function AnalyticTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-50 dark:bg-surface-800/50 rounded-lg p-3">
      <p className="text-[11px] text-surface-500 dark:text-surface-400 font-medium">{label}</p>
      <p className="text-lg font-display font-bold text-navy-900 dark:text-surface-100 mt-0.5">{value}</p>
    </div>
  );
}

function CustomerRow({ customer, icon }: { customer: SegmentedCustomer; icon: React.ReactNode }) {
  const score = customer.healthScore ?? 100;
  const healthColor =
    score >= 80
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
      : score >= 50
      ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20'
      : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20';

  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-900 dark:text-surface-100 truncate">
            {customer.name}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
            {customer.serviceTypeLabel}
            {customer.daysOverdue > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                · {customer.daysOverdue}d overdue
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${healthColor}`}>
          Health: {score}
        </div>
        <p className="text-sm font-semibold text-navy-900 dark:text-surface-100">
          {formatINR(customer.expectedValue)}
        </p>
      </div>
    </div>
  );
}

function ReadyToBookSection({ customers }: { customers: SegmentedCustomer[] }) {
  if (customers.length === 0) return null;
  return (
    <div className="card-base overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-100 dark:border-surface-800 bg-emerald-50/50 dark:bg-emerald-950/30">
        <UserCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100">Ready To Book</h3>
        <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">{customers.length}</span>
      </div>
      <div className="divide-y divide-surface-100 dark:divide-surface-800">
        {customers.map((c) => (
          <CustomerRow
            key={c.id}
            customer={c}
            icon={<UserCheck size={16} className="text-emerald-500" />}
          />
        ))}
      </div>
    </div>
  );
}

function FollowUpSection({ customers }: { customers: SegmentedCustomer[] }) {
  if (customers.length === 0) return null;
  return (
    <div className="card-base overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-100 dark:border-surface-800 bg-amber-50/50 dark:bg-amber-950/30">
        <Phone size={16} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100">Follow-Up Needed</h3>
        <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">{customers.length}</span>
      </div>
      <div className="divide-y divide-surface-100 dark:divide-surface-800">
        {customers.map((c) => (
          <CustomerRow
            key={c.id}
            customer={c}
            icon={<Phone size={16} className="text-amber-500" />}
          />
        ))}
      </div>
    </div>
  );
}

function ChurnRiskSection({ customers }: { customers: SegmentedCustomer[] }) {
  if (customers.length === 0) return null;
  return (
    <div className="card-base overflow-hidden border-red-200 dark:border-red-900/50">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/30">
        <UserX size={16} className="text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100">High Churn Risk</h3>
        <span className="ml-auto text-xs font-medium text-red-600 dark:text-red-400">{customers.length}</span>
      </div>
      <div className="divide-y divide-red-100 dark:divide-red-900/30">
        {customers.map((c) => (
          <CustomerRow
            key={c.id}
            customer={c}
            icon={<AlertTriangle size={16} className="text-red-500" />}
          />
        ))}
      </div>
    </div>
  );
}
