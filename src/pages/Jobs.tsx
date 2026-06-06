import { useServiceCards, useUpdateJobStatus } from '../lib/queries';
import { format } from 'date-fns';
import {
  Clock,
  CheckCircle2,
  CircleDot,
  ChevronRight,
  Droplets,
} from 'lucide-react';
import type { JobStatus, ServiceCardWithDetails } from '../lib/types';
import { TableSkeleton } from '../components/LoadingSkeleton';

const columns: { status: JobStatus; label: string; icon: typeof CircleDot; color: string; bgColor: string }[] = [
  {
    status: 'pending',
    label: 'Pending',
    icon: CircleDot,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  {
    status: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
  },
];

export default function Jobs() {
  const { data: allCards, isLoading } = useServiceCards();

  if (isLoading) return <TableSkeleton rows={5} cols={4} />;

  const grouped = new Map<JobStatus, ServiceCardWithDetails[]>();
  columns.forEach((c) => grouped.set(c.status, []));
  allCards?.forEach((card) => {
    const list = grouped.get(card.job_status) ?? [];
    list.push(card);
    grouped.set(card.job_status, list);
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <p className="text-slate-500 text-sm mt-1">
          Track and manage service jobs across all stages
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {columns.map(({ status, label, icon: Icon, color }) => {
          const cards = grouped.get(status) ?? [];
          return (
            <div key={status} className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className={color} />
                <h2 className="text-sm font-semibold text-slate-900">
                  {label}
                </h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {cards.length}
                </span>
              </div>
              <div className="space-y-3 flex-1">
                {cards.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                    <p className="text-sm text-slate-400">No {label.toLowerCase()} jobs</p>
                  </div>
                ) : (
                  cards.map((card) => (
                    <JobCard key={card.id} card={card} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobCard({ card }: { card: ServiceCardWithDetails }) {
  const updateStatus = useUpdateJobStatus();
  const nextStatus: Record<JobStatus, JobStatus | null> = {
    pending: 'in_progress',
    in_progress: 'completed',
    completed: null,
  };
  const next = nextStatus[card.job_status];
  const nextLabel: Record<JobStatus, string> = {
    pending: 'Start Job',
    in_progress: 'Mark Complete',
    completed: '',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {card.customers?.name}
          </h3>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <Droplets size={10} />
            {card.customers?.tank_capacity_liters}L
          </p>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            card.job_status === 'pending'
              ? 'bg-amber-100 text-amber-700'
              : card.job_status === 'in_progress'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {card.job_status.replace('_', ' ')}
        </span>
      </div>

      <div className="space-y-1 mb-3">
        <p className="text-xs text-slate-500">
          Service: {format(new Date(card.service_date), 'dd MMM yyyy')}
        </p>
        {card.next_service_date && (
          <p className="text-xs text-slate-500">
            Next: {format(new Date(card.next_service_date), 'dd MMM yyyy')}
          </p>
        )}
        {card.staff && (
          <p className="text-xs text-slate-500">
            Technician: {card.staff.name}
          </p>
        )}
        {card.notes && (
          <p className="text-xs text-slate-400 italic">{card.notes}</p>
        )}
      </div>

      {next && (
        <button
          onClick={() => updateStatus.mutate({ id: card.id, status: next })}
          disabled={updateStatus.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {nextLabel[card.job_status]}
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}
