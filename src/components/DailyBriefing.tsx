import { X, Briefcase, Users, AlertTriangle, Package, Bell, Headphones, Lightbulb, CheckCircle2, Circle, Clock, MapPin } from 'lucide-react';
import { useDailyBriefing } from '../lib/queries';
import type { DailyBriefing as BriefingData, BriefingJob, BriefingWorker } from '../lib/types';
import { SERVICE_TYPE_LABELS } from '../lib/types';

interface Props {
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function JobsSection({ jobs }: { jobs: BriefingData['jobs'] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Briefcase size={18} className="text-blue-600" />
        <h3 className="font-semibold text-slate-900">Today's Jobs</h3>
        <span className="ml-auto text-sm font-medium text-slate-500">{jobs.total} total</span>
      </div>
      <div className="flex gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <span className="text-xs font-medium text-amber-600">Pending: {jobs.pending}</span>
        <span className="text-xs font-medium text-blue-600">In Progress: {jobs.inProgress}</span>
        <span className="text-xs font-medium text-green-600">Completed: {jobs.completed}</span>
      </div>
      {jobs.items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">No jobs scheduled today</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {jobs.items.map((job: BriefingJob) => (
            <div key={job.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-slate-900">{job.customerName}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{job.serviceTypeLabel}</p>
                  {job.customerAddress && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
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
                    <p className="text-xs text-slate-500 mt-1">Worker: {job.workerName}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-slate-400">
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Users size={18} className="text-purple-600" />
        <h3 className="font-semibold text-slate-900">Workers Summary</h3>
        <span className="ml-auto text-sm font-medium text-slate-500">{workers.checkedIn} / {workers.totalActive} active</span>
      </div>
      <div className="divide-y divide-slate-100">
        {workers.items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400 text-center">No workers registered</p>
        ) : (
          workers.items.map((w: BriefingWorker) => (
            <div key={w.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {w.checkedIn ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <Circle size={16} className="text-slate-300" />
                )}
                <span className={`text-sm ${w.checkedIn ? 'text-slate-900' : 'text-slate-500'}`}>
                  {w.name}
                </span>
              </div>
              <span className={`text-xs font-medium ${w.checkedIn ? 'text-green-600' : 'text-slate-400'}`}>
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <AlertTriangle size={18} className="text-amber-600" />
        <h3 className="font-semibold text-slate-900">Customer Preparation Alerts</h3>
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">All customers confirmed</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {alerts.map((a, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-medium text-slate-900">{a.customerName}</p>
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Package size={18} className="text-red-600" />
        <h3 className="font-semibold text-slate-900">Inventory Alerts</h3>
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">All inventory levels are healthy</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {alerts.map((a, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">{a.itemName}</span>
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Bell size={18} className="text-indigo-600" />
        <h3 className="font-semibold text-slate-900">Service Reminders Due</h3>
        <span className="ml-auto text-sm font-medium text-slate-500">{reminders.length}</span>
      </div>
      {reminders.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">No reminders due today</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {reminders.map((r, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-medium text-slate-900">{r.customerName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{r.serviceTypeLabel} — Due: {r.dueDate}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportSection({ openTickets }: { openTickets: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Headphones size={18} className="text-rose-600" />
        <h3 className="font-semibold text-slate-900">Support & Escalations</h3>
      </div>
      <div className="px-5 py-4">
        {openTickets === 0 ? (
          <p className="text-sm text-slate-400">No open support tickets</p>
        ) : (
          <p className="text-sm font-medium text-rose-600">{openTickets} open support ticket(s)</p>
        )}
      </div>
    </div>
  );
}

function InsightsSection({ insights }: { insights: BriefingData['insights'] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Lightbulb size={18} className="text-amber-600" />
        <h3 className="font-semibold text-slate-900">Business Insights</h3>
      </div>
      <div className="px-5 py-4 space-y-2">
        <p className="text-sm text-slate-700">
          <span className="font-medium">Workload:</span> {insights.estimatedWorkload}
        </p>
        {insights.customersToContact > 0 && (
          <p className="text-sm text-slate-700">
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
      <div className="relative bg-slate-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Briefcase size={20} className="text-blue-600" />
              Today's Briefing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {data?.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Loading...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
                  <div className="h-5 w-32 bg-slate-200 rounded mb-4" />
                  <div className="space-y-3">
                    <div className="h-4 bg-slate-100 rounded" />
                    <div className="h-4 bg-slate-100 rounded w-3/4" />
                    <div className="h-4 bg-slate-100 rounded w-1/2" />
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
            <p className="text-center text-slate-400 py-8">Failed to load briefing data</p>
          )}
        </div>
      </div>
    </div>
  );
}
