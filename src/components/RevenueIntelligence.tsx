import { useState } from 'react';
import {
  IndianRupee,
  Users,
  ThumbsUp,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ChevronRight,
  BarChart3,
  Lightbulb,
  Phone,
} from 'lucide-react';
import { useRevenueIntelligence, useUpdateReminderResponse } from '../lib/queries';
import type { CustomerSegmentItem, BusinessInsight } from '../lib/types';

const summaryCards = [
  {
    key: 'potentialRevenueDue' as const,
    label: 'Potential Revenue Due This Month',
    icon: IndianRupee,
    prefix: '₹',
    color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  {
    key: 'customersDue' as const,
    label: 'Customers Due',
    icon: Users,
    prefix: '',
    color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
  {
    key: 'respondedToReminder' as const,
    label: 'Responded To Reminder',
    icon: ThumbsUp,
    prefix: '',
    color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
    iconBg: 'bg-green-100 dark:bg-green-900/50',
  },
  {
    key: 'awaitingFollowUp' as const,
    label: 'Awaiting Follow-Up',
    icon: Clock,
    prefix: '',
    color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  {
    key: 'highChurnRisk' as const,
    label: 'High Churn Risk',
    icon: AlertTriangle,
    prefix: '',
    color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/50',
  },
  {
    key: 'potentialRevenueRecovery' as const,
    label: 'Potential Revenue Recovery',
    icon: RefreshCw,
    prefix: '₹',
    color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50',
  },
];

const segmentConfig = {
  ready_to_book: {
    label: 'Ready To Book',
    icon: CheckCircle2,
    color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    headerColor: 'text-green-700 dark:text-green-400',
    iconColor: 'text-green-500',
  },
  follow_up_needed: {
    label: 'Follow-Up Needed',
    icon: Clock,
    color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    headerColor: 'text-amber-700 dark:text-amber-400',
    iconColor: 'text-amber-500',
  },
  high_churn_risk: {
    label: 'High Churn Risk',
    icon: XCircle,
    color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    headerColor: 'text-red-700 dark:text-red-400',
    iconColor: 'text-red-500',
  },
};

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
          <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function RevenueIntelligence() {
  const { data, isLoading } = useRevenueIntelligence();

  const [showSegments, setShowSegments] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showInsights, setShowInsights] = useState(true);

  if (isLoading) {
    return (
      <div className="mt-8">
        <RevenueHeader />
        <SummarySkeleton />
      </div>
    );
  }

  if (!data) return null;

  const { revenueIntelligence, segments, reminderAnalytics, insights } = data;

  return (
    <div className="mt-8 space-y-6">
      <RevenueHeader />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaryCards.map(({ key, label, icon: Icon, prefix, color, iconBg }) => {
          const value = revenueIntelligence[key];
          const display = prefix
            ? `${prefix}${(value as number).toLocaleString('en-IN')}`
            : `${value}`;
          return (
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
                    {display}
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg ${iconBg}`}>
                  <Icon size={20} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Segments */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setShowSegments(!showSegments)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600">
              <BarChart3 size={18} />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Customer Segmentation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {segments.length} classified customers
              </p>
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-slate-400 transition-transform ${showSegments ? 'rotate-90' : ''}`}
          />
        </button>

        {showSegments && (
          <div className="px-5 pb-5 space-y-4">
            {(Object.keys(segmentConfig) as Array<keyof typeof segmentConfig>).map((segKey) => {
              const config = segmentConfig[segKey];
              const items = segments.filter(s => s.segment === segKey);
              if (items.length === 0) return null;
              const Icon = config.icon;
              return (
                <div key={segKey} className={`rounded-lg border p-4 ${config.color}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={16} className={config.iconColor} />
                    <h4 className={`text-sm font-semibold ${config.headerColor}`}>
                      {config.label}
                    </h4>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <SegmentRow key={item.serviceCardId} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
            {segments.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
                No customers classified yet. Send reminders to start tracking.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reminder Analytics */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600">
              <TrendingUp size={18} />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Reminder Analytics
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track how reminders convert into bookings
              </p>
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-slate-400 transition-transform ${showAnalytics ? 'rotate-90' : ''}`}
          />
        </button>

        {showAnalytics && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <AnalyticsStat label="Reminders Sent" value={reminderAnalytics.totalSent} icon={MessageSquare} color="text-blue-600" />
              <AnalyticsStat label="Responses" value={reminderAnalytics.responses} icon={ThumbsUp} color="text-green-600" />
              <AnalyticsStat label="Bookings Generated" value={reminderAnalytics.bookingsGenerated} icon={CheckCircle2} color="text-emerald-600" />
              <AnalyticsStat label="Conversion Rate" value={`${reminderAnalytics.conversionRate}%`} icon={TrendingUp} color="text-purple-600" />
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Conversion Funnel</span>
              </div>
              <div className="space-y-2">
                <FunnelBar
                  label="Reminders Sent"
                  value={reminderAnalytics.totalSent}
                  max={reminderAnalytics.totalSent}
                  color="bg-blue-500"
                />
                <FunnelBar
                  label="Responded"
                  value={reminderAnalytics.responses}
                  max={reminderAnalytics.totalSent}
                  color="bg-green-500"
                />
                <FunnelBar
                  label="Booked"
                  value={reminderAnalytics.bookingsGenerated}
                  max={reminderAnalytics.totalSent}
                  color="bg-emerald-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600">
                <Lightbulb size={18} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Business Insights
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Actionable insights to grow revenue
                </p>
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`text-slate-400 transition-transform ${showInsights ? 'rotate-90' : ''}`}
            />
          </button>

          {showInsights && (
            <div className="px-5 pb-5 space-y-2">
              {insights.map((insight, i) => (
                <InsightRow key={i} insight={insight} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevenueHeader() {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm">
        <TrendingUp size={20} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Revenue Intelligence
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Business value analysis from customer data
        </p>
      </div>
    </div>
  );
}

function SegmentRow({ item }: { item: CustomerSegmentItem }) {
  const updateResponse = useUpdateReminderResponse();
  const isChurn = item.segment === 'high_churn_risk';
  const isReady = item.segment === 'ready_to_book';

  const handleMarkInterested = () => {
    updateResponse.mutate({ cardId: item.serviceCardId, response: 'interested' });
  };

  return (
    <div className="flex items-center justify-between bg-white dark:bg-slate-800/50 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
          {item.customerName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-white truncate">
            {item.customerName}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Phone size={8} />
            {item.customerPhone}
            {item.lastServiceDate && (
              <span>· Last: {new Date(item.lastServiceDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-xs font-semibold text-green-600 dark:text-green-400">
          {formatCurrency(item.expectedValue)}
        </span>
        {item.daysOverdue > 0 && (
          <span className="text-[10px] text-red-500 font-medium">
            {item.daysOverdue}d overdue
          </span>
        )}
        {isReady && (
          <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 px-1.5 py-0.5 rounded-full font-medium">
            Interested
          </span>
        )}
        {isChurn && (
          <button
            onClick={handleMarkInterested}
            className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium hover:bg-blue-200 transition-colors"
          >
            Recover
          </button>
        )}
      </div>
    </div>
  );
}

function AnalyticsStat({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 text-center">
      <Icon size={16} className={`mx-auto mb-1 ${color}`} />
      <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-medium text-slate-900 dark:text-white">{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: BusinessInsight }) {
  const icons = {
    warning: AlertTriangle,
    info: Lightbulb,
    positive: CheckCircle2,
  };
  const colors = {
    warning: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    info: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    positive: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  };
  const iconColors = {
    warning: 'text-red-500',
    info: 'text-blue-500',
    positive: 'text-green-500',
  };
  const Icon = icons[insight.type];

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${colors[insight.type]}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${iconColors[insight.type]}`} />
      <p className="text-sm">{insight.message}</p>
    </div>
  );
}
