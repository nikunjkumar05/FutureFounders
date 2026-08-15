import { useRevenueIntelligence, useMarkReminderSent, useCreateReminderResponse, useMonthlyRevenue, useAmcContractsDue } from '../lib/queries';
import { memo, useMemo, useState, useCallback } from 'react';
import type { SegmentedCustomer, ServiceGroup, AmcFrequency } from '../lib/types';
import type { AmcContractDueInfo } from '../lib/amc-types';
import { trackEvent } from '../lib/analytics';
import { normalizeIndianPhone } from '../lib/phone';
import { CreateJobModal } from '../pages/Jobs';
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
  Bell,
  Loader2,
  Calendar,
} from 'lucide-react';

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

const reminderMessages: Record<string, string> = {
  standard_cleaning: `Namaste {name}! Aapke paani ki tanki ki safai ka samay aa gaya hai. Gande tank se bimariyan failti hain. Aaj hi safai book karein! Reply YES to confirm or call 9876543210. — AquaClean Services`,
  deep_cleaning: `Hi {name}! It's time for your deep cleaning service. Our intensive cleaning removes all buildup and bacteria. Book now! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
  sofa_cleaning: `Hi {name}! It's time for your sofa cleaning service. Keep your furniture fresh and hygienic! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
  seats_cleaning: `Hi {name}! It's time for your seats cleaning service. Enjoy a fresh and clean ride! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
  carpet_cleaning: `Hi {name}! It's time for your carpet cleaning service. Keep your carpets fresh and hygienic! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
  custom_service: `Hi {name}! It's time for your service with AquaClean Services. Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
};

export default function RevenueIntelligence() {
  const { data, isLoading } = useRevenueIntelligence();
  const markReminder = useMarkReminderSent();
  const createReminderResponse = useCreateReminderResponse();
  const { data: dueContracts } = useAmcContractsDue();
  const [sendingCustomerId, setSendingCustomerId] = useState<string | null>(null);
  const [schedulingContract, setSchedulingContract] = useState<{
    customerId: string;
    serviceGroups: ServiceGroup[];
    contractId: string;
    frequency: AmcFrequency;
  } | null>(null);

  const now = new Date();
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [selYear, selMonth] = selectedMonth.split('-').map(Number);
  const { data: monthlyData, isLoading: monthlyLoading } = useMonthlyRevenue(selYear, selMonth);

  const handleCall = useCallback((phone: string) => {
    const normalized = normalizeIndianPhone(phone);
    if (!normalized) {
      alert(`Cannot call this customer: invalid phone number "${phone}".`);
      return;
    }
    window.open(`tel:${normalized}`);
  }, []);

  const handleSendReminder = useCallback((customer: SegmentedCustomer) => {
    if (sendingCustomerId === customer.id) return;
    if (!customer.anchorCardId) return;

    setSendingCustomerId(customer.id);

    const template = reminderMessages[customer.serviceType] ?? reminderMessages.standard_cleaning;
    const message = template.replace('{name}', customer.name);
    const waNumber = normalizeIndianPhone(customer.phone);
    if (!waNumber) {
      alert(`Cannot send a reminder to ${customer.name}: invalid phone number "${customer.phone}".`);
      setSendingCustomerId(null);
      return;
    }
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`);

    trackEvent('reminder_sent', {
      customer_id: customer.id,
      customer_name: customer.name,
      service_type: customer.serviceType,
    });

    Promise.allSettled([
      markReminder.mutateAsync({ cardId: customer.anchorCardId }),
      createReminderResponse.mutateAsync({
        serviceCardId: customer.anchorCardId,
        customerId: customer.id,
        status: 'sent',
      }),
    ]).then((results) => {
      const rejected = results.filter((r) => r.status === 'rejected');
      if (rejected.length > 0) {
        const errors = rejected.map((r) => (r as PromiseRejectedResult).reason);
        for (const err of errors) {
          console.error('[ActionCenter] Reminder mutation failed:', err);
        }
      }
    }).finally(() => setSendingCustomerId(null));
  }, [sendingCustomerId, markReminder, createReminderResponse]);

  const handleScheduleVisit = useCallback((contract: AmcContractDueInfo) => {
    const template = (contract.contract.service_template ?? {}) as Record<string, unknown>;
    const groups = (Array.isArray(template.services) ? template.services : []) as ServiceGroup[];
    setSchedulingContract({
      customerId: contract.contract.customer_id,
      serviceGroups: groups,
      contractId: contract.contract.id,
      frequency: contract.contract.frequency,
    });
  }, []);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
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
  }, [data]);

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

  return (
    <>
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

      {/* Monthly Revenue Widget */}
      <div className="card-base p-4 border border-surface-200 dark:border-surface-700 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-500" />
            <h3 className="text-xs font-display font-semibold text-navy-900 dark:text-surface-100 uppercase tracking-wide">
              Monthly Revenue
            </h3>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs border border-surface-200 dark:border-surface-600 rounded px-2 py-1 bg-white dark:bg-surface-800 text-navy-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </div>
        {monthlyLoading ? (
          <div className="h-10 w-56 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <p className="text-sm text-surface-700 dark:text-surface-300 font-medium">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatINR(monthlyData?.totalRevenue || 0)}</span>
              {' '}total
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              {monthlyData?.completedJobCount ?? 0} completed job{monthlyData?.completedJobCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
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

      {/* AMC Due Visits */}
      <AmcDueSection
        contracts={dueContracts ?? []}
        onSchedule={handleScheduleVisit}
      />

      {/* Customer Segments — Action Center */}
      <div className="space-y-3">
        <ReadyToBookSection
          customers={data.segments.readyToBook}
          onCall={handleCall}
          onSendReminder={handleSendReminder}
          sendingCustomerId={sendingCustomerId}
        />
        <FollowUpSection
          customers={data.segments.followUpNeeded}
          onCall={handleCall}
        />
        <ChurnRiskSection
          customers={data.segments.highChurnRisk}
          onCall={handleCall}
        />
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

    {schedulingContract && (
      <CreateJobModal
        onClose={() => setSchedulingContract(null)}
        initialCustomerId={schedulingContract.customerId}
        initialServiceGroups={schedulingContract.serviceGroups}
        amcContractId={schedulingContract.contractId}
        frequency={schedulingContract.frequency}
      />
    )}
  </>
  );
}

const MetricTile = memo(function MetricTile({ label, value, icon: Icon, color, sub }: {
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
});

const AnalyticTile = memo(function AnalyticTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-50 dark:bg-surface-800/50 rounded-lg p-3">
      <p className="text-[11px] text-surface-500 dark:text-surface-400 font-medium">{label}</p>
      <p className="text-lg font-display font-bold text-navy-900 dark:text-surface-100 mt-0.5">{value}</p>
    </div>
  );
});

function CustomerRow({ customer, icon, actions }: {
  customer: SegmentedCustomer;
  icon: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const score = customer.healthScore ?? 100;
  const healthColor =
    score >= 80
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
      : score >= 50
      ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20'
      : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20';

  return (
    <div className="py-2 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
      <div className="flex items-center justify-between">
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
      {actions && (
        <div className="flex items-center gap-2 mt-2 ml-9">
          {actions}
        </div>
      )}
    </div>
  );
}

function CallButton({ phone, onCall }: { phone: string; onCall: (phone: string) => void }) {
  return (
    <button
      onClick={() => onCall(phone)}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
        bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300
        hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
    >
      <Phone size={12} />
      Call
    </button>
  );
}

function SendReminderButton({
  customer,
  onSendReminder,
  disabled,
}: {
  customer: SegmentedCustomer;
  onSendReminder: (customer: SegmentedCustomer) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => onSendReminder(customer)}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
        bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300
        hover:bg-emerald-100 dark:hover:bg-emerald-900/40
        disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {disabled ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
      Send Reminder
    </button>
  );
}

function ReadyToBookSection({ customers, onCall, onSendReminder, sendingCustomerId }: {
  customers: SegmentedCustomer[];
  onCall: (phone: string) => void;
  onSendReminder: (customer: SegmentedCustomer) => void;
  sendingCustomerId: string | null;
}) {
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
            actions={
              <div className="flex items-center gap-2">
                <CallButton phone={c.phone} onCall={onCall} />
                <SendReminderButton
                  customer={c}
                  onSendReminder={onSendReminder}
                  disabled={sendingCustomerId === c.id}
                />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

function FollowUpSection({ customers, onCall }: {
  customers: SegmentedCustomer[];
  onCall: (phone: string) => void;
}) {
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
            actions={<CallButton phone={c.phone} onCall={onCall} />}
          />
        ))}
      </div>
    </div>
  );
}

function ChurnRiskSection({ customers, onCall }: {
  customers: SegmentedCustomer[];
  onCall: (phone: string) => void;
}) {
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
            actions={<CallButton phone={c.phone} onCall={onCall} />}
          />
        ))}
      </div>
    </div>
  );
}

function AmcDueSection({ contracts, onSchedule }: {
  contracts: AmcContractDueInfo[];
  onSchedule: (contract: AmcContractDueInfo) => void;
}) {
  if (contracts.length === 0) return null;
  return (
    <div className="card-base overflow-hidden border border-navy-200 dark:border-navy-700">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-100 dark:border-surface-800 bg-navy-50/50 dark:bg-navy-950/30">
        <Calendar size={16} className="text-navy-600 dark:text-navy-400" />
        <h3 className="text-sm font-display font-semibold text-navy-900 dark:text-surface-100">AMC Due Visits</h3>
        <span className="ml-auto text-xs font-medium text-navy-600 dark:text-navy-400">{contracts.length}</span>
      </div>
      <div className="divide-y divide-surface-100 dark:divide-surface-800">
        {contracts.map((item) => {
          const customer = item.contract.customers;
          return (
            <div key={item.contract.id} className="py-2 px-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Calendar size={16} className="text-navy-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 dark:text-surface-100 truncate">
                      {customer?.name ?? 'Unknown Customer'}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {item.contract.frequency} · {item.daysUntilDue > 0 ? `Due in ${item.daysUntilDue}d` : item.daysUntilDue === 0 ? 'Due today' : `Overdue by ${Math.abs(item.daysUntilDue)}d`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onSchedule(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
                    bg-navy-600 text-white hover:bg-navy-700 transition-colors shrink-0 ml-3"
                >
                  <Calendar size={12} />
                  Schedule Visit
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
