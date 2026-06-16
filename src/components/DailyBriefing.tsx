import { X, Briefcase, Users, AlertTriangle, Package, Bell, Headphones, Lightbulb, CheckCircle2, Circle, Clock, MapPin } from 'lucide-react';
import { useDailyBriefing } from '../lib/queries';
import type { DailyBriefing as BriefingData, BriefingJob, BriefingWorker } from '../lib/types';


interface Props {
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'badge-warn',
  in_progress: 'badge-info',
  completed: 'badge-ok',
};

const statusLabels: Record<string, string> = {
  pending: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
};

function JobsSection({ jobs }: { jobs: BriefingData['jobs'] }) {
  return (
    <div className="card-base overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/50">
        <Briefcase size={18} className="text-cyan-600 dark:text-cyan-400" />
        <h3 className="font-display font-semibold text-surface-900 dark:text-surface-100">Today's jobs</h3>
        <span className="ml-auto text-body-sm text-surface-500 dark:text-surface-400">{jobs.total} total</span>
      </div>
      <div className="flex gap-4 px-5 py-3 border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30">
        <span className="text-xs font-display font-medium text-red-600 dark:text-red-400">Scheduled: {jobs.pending}</span>
        <span className="text-xs font-display font-medium text-cyan-600 dark:text-cyan-400">In progress: {jobs.inProgress}</span>
        <span className="text-xs font-display font-medium text-cyan-600 dark:text-cyan-400">Done: {jobs.completed}</span>
      </div>
      {jobs.items.length === 0 ? (
        <p className="px-5 py-6 text-body-sm text-surface-400 dark:text-surface-500 text-center">No jobs scheduled today</p>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-800">
          {jobs.items.map((job: BriefingJob) => (
            <div key={job.id} className="px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-medium text-surface-900 dark:text-surface-100">{job.customerName}</p>
                  <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-0.5">{job.serviceTypeLabel}</p>
                  {job.customerAddress && (
                    <p className="text-body-xs text-surface-400 dark:text-surface-500 mt-0.5 flex items-center gap-1">
                      <MapPin size={10} />
                      {job.customerAddress}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[job.status]}`}>
                    {statusLabels[job.status]}
                  </span>
                  {job.workerName && (
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Worker: {job.workerName}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-surface-400 dark:text-surface-500">
                {job.scheduledTime && <span className="flex items-center gap-1"><Clock size={10} />{job.scheduledTime}</span>}
                <span>Ready: {job.readinessStatus}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkersSection({ workers }: { workers: BriefingData['workers'] }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <Users size={18} className="text-purple-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Workers Summary</h3>
        <span className="ml-auto text-sm font-medium text-surface-500 dark:text-surface-400">{workers.checkedIn} / {workers.totalActive} active</span>
      </div>
      <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
        {workers.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-surface-400 dark:text-surface-500 text-center">No workers registered</p>
        ) : (
          workers.items.map((w: BriefingWorker) => (
            <div key={w.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {w.checkedIn ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <Circle size={16} className="text-surface-300 dark:text-surface-600" />
                )}
                <span className={`text-sm ${w.checkedIn ? 'text-surface-900 dark:text-white' : 'text-surface-500 dark:text-surface-400'}`}>
                  {w.name}
                </span>
              </div>
              <span className={`text-xs font-medium ${w.checkedIn ? 'text-green-600' : 'text-surface-400 dark:text-surface-500'}`}>
                {w.checkedIn ? (w.checkinTime ? `Checked in ${new Date(w.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Checked in') : 'Not checked in'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CustomerAlertsSection({ alerts }: { alerts: BriefingData['customerAlerts'] }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <AlertTriangle size={18} className="text-amber-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Customer Preparation Alerts</h3>
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-surface-400 dark:text-surface-500 text-center">All customers confirmed</p>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
          {alerts.map((a, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-medium text-surface-900 dark:text-white">{a.customerName}</p>
              <p className="text-xs text-amber-600 mt-0.5">{a.issue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryAlertsSection({ alerts }: { alerts: BriefingData['inventoryAlerts'] }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <Package size={18} className="text-red-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Inventory Alerts</h3>
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-surface-400 dark:text-surface-500 text-center">All inventory levels are healthy</p>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
          {alerts.map((a, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-surface-900 dark:text-white">{a.itemName}</span>
              <span className="text-sm text-red-600 font-medium">{a.remaining} remaining</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemindersSection({ reminders }: { reminders: BriefingData['reminders'] }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <Bell size={18} className="text-indigo-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Service Reminders Due</h3>
        <span className="ml-auto text-sm font-medium text-surface-500 dark:text-surface-400">{reminders.length}</span>
      </div>
      {reminders.length === 0 ? (
        <p className="px-5 py-6 text-sm text-surface-400 dark:text-surface-500 text-center">No reminders due today</p>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
          {reminders.map((r, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-medium text-surface-900 dark:text-white">{r.customerName}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{r.serviceTypeLabel} — Due: {r.dueDate}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportSection({ openTickets }: { openTickets: number }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <Headphones size={18} className="text-rose-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Support & Escalations</h3>
      </div>
      <div className="px-5 py-4">
        {openTickets === 0 ? (
          <p className="text-sm text-surface-400 dark:text-surface-500">No open support tickets</p>
        ) : (
          <p className="text-sm font-medium text-rose-600">{openTickets} open support ticket(s)</p>
        )}
      </div>
    </div>
  );
}

function InsightsSection({ insights }: { insights: BriefingData['insights'] }) {
  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-900/50">
        <Lightbulb size={18} className="text-amber-600" />
        <h3 className="font-semibold text-surface-900 dark:text-white">Business Insights</h3>
      </div>
      <div className="px-5 py-4 space-y-2">
        <p className="text-sm text-surface-700 dark:text-surface-200">
          <span className="font-medium">Workload:</span> {insights.estimatedWorkload}
        </p>
        {insights.customersToContact > 0 && (
          <p className="text-sm text-surface-700 dark:text-surface-200">
            <span className="font-medium">Customers to contact:</span> {insights.customersToContact}
          </p>
        )}
        {insights.potentialDelays.map((d, i) => (
          <p key={i} className="text-sm text-amber-600 flex items-center gap-1">
            <AlertTriangle size={14} /> {d}
          </p>
        ))}
        {insights.inventoryRisks.map((r, i) => (
          <p key={i} className="text-sm text-red-600 flex items-center gap-1">
            <Package size={14} /> {r}
          </p>
        ))}
        {insights.potentialDelays.length === 0 && insights.inventoryRisks.length === 0 && (
          <p className="text-sm text-green-600">Everything looks good for today</p>
        )}
      </div>
    </div>
  );
}

export default function DailyBriefing({ onClose }: Props) {
  const { data, isLoading } = useDailyBriefing();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface-50 dark:bg-surface-900/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="sticky top-0 z-10 bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900 dark:text-white flex items-center gap-2">
              <Briefcase size={20} className="text-navy-600" />
              Today's Briefing
            </h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {data?.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Loading...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-surface-400 dark:text-surface-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-6 animate-pulse">
                  <div className="h-5 w-32 bg-surface-200 dark:bg-surface-700 rounded mb-4" />
                  <div className="space-y-3">
                    <div className="h-4 bg-surface-100 dark:bg-surface-700 rounded" />
                    <div className="h-4 bg-surface-100 dark:bg-surface-700 rounded w-3/4" />
                    <div className="h-4 bg-surface-100 dark:bg-surface-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : data ? (
            <>
              <JobsSection jobs={data.jobs} />
              <WorkersSection workers={data.workers} />
              <CustomerAlertsSection alerts={data.customerAlerts} />
              <InventoryAlertsSection alerts={data.inventoryAlerts} />
              <RemindersSection reminders={data.reminders} />
              <SupportSection openTickets={data.openSupportTickets} />
              <InsightsSection insights={data.insights} />
            </>
          ) : (
            <p className="text-center text-surface-400 dark:text-surface-500 py-8">Failed to load briefing data</p>
          )}
        </div>
      </div>
    </div>
  );
}
