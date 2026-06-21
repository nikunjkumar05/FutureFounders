import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useServiceCards, useUpdateJobStatus, useCreateJob, useUpdateJob, useDeleteJob, useStaff, useCustomers, useSendFeedback } from '../lib/queries';
import { format } from 'date-fns';
import {
  Clock,
  CheckCircle2,
  CircleDot,
  ChevronRight,
  Plus,
  X,
  User,
  Calendar,
  FileText,
  Star,
  Edit2,
  Trash2,
  Eye,
  IndianRupee,
} from 'lucide-react';
import type { JobStatus, ServiceCardWithDetails, ServiceType, ServiceItem, ServiceGroup, WageType } from '../lib/types';
import { SERVICE_TYPE_LABELS, WAGE_TYPE_LABELS, generateItemId, buildServiceDetails, getGroupTotal } from '../lib/types';
import { TableSkeleton } from '../components/LoadingSkeleton';
import ContactPicker from '../components/ContactPicker';

const columns: { status: JobStatus; label: string; icon: typeof CircleDot; color: string; badge: string }[] = [
  { status: 'pending', label: 'Scheduled', icon: CircleDot, color: 'text-amber-600 dark:text-amber-400', badge: 'badge-warn' },
  { status: 'in_progress', label: 'In progress', icon: Clock, color: 'text-cyan-600 dark:text-cyan-400', badge: 'badge-info' },
  { status: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-navy-600 dark:text-navy-400', badge: 'badge-ok' },
];

export default function Jobs() {
  const { data: allCards, isLoading } = useServiceCards();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJob, setEditingJob] = useState<ServiceCardWithDetails | null>(null);
  const [deletingJob, setDeletingJob] = useState<ServiceCardWithDetails | null>(null);
  const [viewingJob, setViewingJob] = useState<ServiceCardWithDetails | null>(null);

  if (isLoading) return <TableSkeleton rows={5} cols={4} />;

  const grouped = new Map<JobStatus, ServiceCardWithDetails[]>();
  columns.forEach((c) => grouped.set(c.status, []));
  allCards?.forEach((card) => {
    const list = grouped.get(card.job_status) ?? [];
    list.push(card);
    grouped.set(card.job_status, list);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100">Schedule</h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            Track and manage service jobs across all stages
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus size={16} /> Schedule cleaning
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {columns.map(({ status, label, icon: Icon, color, badge }) => {
          const cards = grouped.get(status) ?? [];
          return (
            <div key={status} className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className={color} />
                <h2 className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{label}</h2>
                <span className={badge}>{cards.length}</span>
              </div>
              <div className="space-y-3 flex-1 min-h-[200px]">
                {cards.length === 0 ? (
                  <div className="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-2xl p-8 text-center">
                    <p className="text-body-sm text-surface-400 dark:text-surface-500">No {label.toLowerCase()} jobs</p>
                  </div>
                ) : (
                  cards.map((card) => (
                    <JobCard key={card.id} card={card} onEdit={() => setEditingJob(card)} onDelete={() => setDeletingJob(card)} onView={() => setViewingJob(card)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreateModal && <CreateJobModal onClose={() => setShowCreateModal(false)} />}
      {editingJob && <EditJobModal card={editingJob} onClose={() => setEditingJob(null)} />}
      {deletingJob && <DeleteJobConfirmModal card={deletingJob} onClose={() => setDeletingJob(null)} />}
      {viewingJob && <JobDetailModal card={viewingJob} onClose={() => setViewingJob(null)} />}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function getServicesFromCard(card: ServiceCardWithDetails): ServiceGroup[] {
  const d = card.service_details as Record<string, unknown>;
  if (d && Array.isArray(d.services)) return d.services as ServiceGroup[];
  const items: ServiceItem[] = [{ id: generateItemId(), quantity: 1, price: 0 }];
  return [{ serviceType: card.service_type as ServiceType, items, totalPrice: 0 }];
}

function getTotalChargeFromCard(card: ServiceCardWithDetails): number {
  const d = card.service_details as Record<string, unknown>;
  if (d && typeof d.totalCharge === 'number') return d.totalCharge;
  return 0;
}

function formatItemDetail(item: ServiceItem, serviceType: ServiceType): string {
  switch (serviceType) {
    case 'standard_cleaning':
    case 'deep_cleaning':
      return `${item.capacity ?? 0}L Tank`;
    case 'sofa_cleaning':
      return `${item.sofaType ?? 'Standard'} Sofa`;
    case 'seats_cleaning':
      return 'Seat';
    case 'carpet_cleaning':
      return `${item.carpetArea ?? 0} sq ft`;
    case 'custom_service':
      return `${item.serviceName ?? 'Service'}${item.notes ? ` — ${item.notes}` : ''}`;
    default:
      return '';
  }
}

function getServiceSummary(svc: ServiceGroup): string {
  const items = svc.items ?? [];
  if (items.length === 0) return 'No items';
  const parts = items.map((item) => {
    const label = formatItemDetail(item, svc.serviceType);
    const qty = item.quantity || 1;
    return qty > 1 ? `${label} × ${qty}` : label;
  });
  return parts.join(' + ');
}

// ─── Job Card ───────────────────────────────────────────────────

function JobCard({ card, onEdit, onDelete, onView }: {
  card: ServiceCardWithDetails; onEdit: () => void; onDelete: () => void; onView: () => void;
}) {
  const updateStatus = useUpdateJobStatus();
  const sendFeedback = useSendFeedback();
  const services = getServicesFromCard(card);
  const totalCharge = getTotalChargeFromCard(card);
  const statusOptions: { value: JobStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  return (
    <div className="card-base p-4 relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-surface-900 dark:text-surface-100 text-sm truncate">{card.customers?.name}</h3>
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 mt-0.5">
            {services.length > 1 ? `${services.length} services` : SERVICE_TYPE_LABELS[services[0]?.serviceType as ServiceType] ?? card.service_type}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onView} className="btn-ghost p-1.5" title="View details"><Eye size={14} /></button>
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="btn-ghost p-1.5 text-surface-400 hover:text-amber-600" title="Delete"><Trash2 size={14} /></button>
          <span className={`ml-1 ${
            card.job_status === 'pending' ? 'badge-warn'
              : card.job_status === 'in_progress' ? 'badge-info'
              : 'badge-ok'
          }`}>
            {card.job_status === 'pending' ? 'scheduled' : card.job_status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="text-xs text-surface-600 dark:text-surface-400 space-y-1">
        {services.map((svc, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="truncate">{SERVICE_TYPE_LABELS[svc.serviceType as ServiceType] ?? svc.serviceType}: {getServiceSummary(svc)}</span>
            {svc.totalPrice > 0 && <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium whitespace-nowrap ml-2">₹{svc.totalPrice.toLocaleString('en-IN')}</span>}
          </div>
        ))}
      </div>

      <div className="space-y-1 mt-2 mb-3 text-xs text-surface-500 dark:text-surface-400">
        <p className="flex items-center gap-1.5"><Calendar size={10} />{format(new Date(card.service_date), 'dd MMM yyyy')}</p>
        {card.staff && <p className="flex items-center gap-1.5"><User size={10} />{card.staff.name}</p>}
        {totalCharge > 0 && <p className="font-mono font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5"><IndianRupee size={10} />Total: ₹{totalCharge.toLocaleString('en-IN')}</p>}
        {card.notes && <p className="italic flex items-center gap-1.5"><FileText size={10} />{card.notes}</p>}
      </div>

      <div className="flex gap-2">
        <select
          value={card.job_status}
          onChange={(e) => { const ns = e.target.value as JobStatus; if (ns !== card.job_status) updateStatus.mutate({ id: card.id, status: ns }); }}
          disabled={updateStatus.isPending}
          className={`flex-1 text-xs font-display font-medium px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
            card.job_status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800'
              : card.job_status === 'in_progress' ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-400 dark:border-cyan-800'
              : 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-400 dark:border-cyan-800'
          }`}
        >
          {statusOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      {card.job_status === 'completed' && !card.feedback_sent && (
        <button
          onClick={() => sendFeedback.mutate({ cardId: card.id, rating: 'good' })}
          disabled={sendFeedback.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-display font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 py-2 rounded-xl transition-colors disabled:opacity-50 mt-2"
        ><Star size={12} /> Send feedback request</button>
      )}

      {card.job_status === 'completed' && card.feedback_sent && (
        <div className="w-full flex items-center justify-center gap-1.5 text-xs font-display font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/50 py-2 rounded-xl mt-2">
          <CheckCircle2 size={12} /> Feedback sent
        </div>
      )}
    </div>
  );
}

// ─── Job Detail Modal ──────────────────────────────────────────

function JobDetailModal({ card, onClose }: { card: ServiceCardWithDetails; onClose: () => void }) {
  const services = getServicesFromCard(card);
  const totalCharge = getTotalChargeFromCard(card);

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Job details</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">Created {format(new Date(card.created_at), 'dd MMM yyyy, h:mm a')}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
            <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">Customer</h3>
            <p className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{card.customers?.name}</p>
            <p className="text-body-xs text-surface-500 dark:text-surface-400">{card.customers?.phone}</p>
            {card.customers?.address && <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">{card.customers.address}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1">Status</h3>
              <span className={`${
                card.job_status === 'pending' ? 'badge-warn'
                  : card.job_status === 'in_progress' ? 'badge-info'
                  : 'badge-ok'
              }`}>{card.job_status.replace('_', ' ')}</span>
            </div>
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1">Service date</h3>
              <p className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">{format(new Date(card.service_date), 'dd MMM yyyy')}</p>
            </div>
          </div>

          <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
            <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">Assigned worker</h3>
            {card.staff ? (
              <div className="flex items-center gap-2">
                <User size={14} className="text-surface-400 dark:text-surface-500" />
                <span className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">{card.staff.name}</span>
                <span className="font-mono text-xs text-surface-500 dark:text-surface-400">{WAGE_TYPE_LABELS[card.staff.wage_type ?? 'daily']} · ₹{(card.staff.wage_amount || card.staff.daily_wage_inr).toLocaleString()}</span>
              </div>
            ) : <span className="text-body-sm text-surface-400 dark:text-surface-500">Unassigned</span>}
          </div>

          <div>
            <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-3">Services ({services.length})</h3>
            <div className="space-y-3">
              {services.map((svc, idx) => (
                <div key={idx} className="border border-surface-200 dark:border-surface-700 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{SERVICE_TYPE_LABELS[svc.serviceType as ServiceType] ?? svc.serviceType}</p>
                    {svc.totalPrice > 0 && <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">₹{svc.totalPrice.toLocaleString('en-IN')}</span>}
                  </div>
                  <div className="space-y-1">
                    {svc.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex items-center justify-between text-xs text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800/50 rounded-lg px-2.5 py-1.5">
                        <div>
                          <span className="text-surface-700 dark:text-surface-200">{formatItemDetail(item, svc.serviceType)}</span>
                          <span className="text-surface-400 ml-2">Qty: {item.quantity}{item.price > 0 ? ` · ₹${item.price.toLocaleString('en-IN')}/unit` : ''}</span>
                        </div>
                        {item.price > 0 && <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium ml-2">₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalCharge > 0 && (
            <div className="bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-display font-semibold text-cyan-700 dark:text-cyan-300">Total charge</span>
              <span className="font-mono text-lg font-bold text-cyan-700 dark:text-cyan-300">₹{totalCharge.toLocaleString('en-IN')}</span>
            </div>
          )}

          {card.next_service_date && (
            <div className="bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 rounded-xl p-3">
              <p className="text-xs text-cyan-700 dark:text-cyan-300">Next service due: {format(new Date(card.next_service_date), 'dd MMM yyyy')}</p>
            </div>
          )}

          {card.notes && (
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
              <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-1">Notes</h3>
              <p className="text-body-sm text-surface-700 dark:text-surface-200">{card.notes}</p>
            </div>
          )}

          {card.feedback_sent && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-2">
              <Star size={14} className="text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300">Feedback {card.feedback_rating ? `rated: ${card.feedback_rating}` : 'sent'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create Job Modal ────────────────────────────────────────────

const serviceOptions: { value: ServiceType; label: string }[] = [
  { value: 'standard_cleaning', label: 'Water Tank Cleaning' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'sofa_cleaning', label: 'Sofa Cleaning' },
  { value: 'seats_cleaning', label: 'Seats Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'custom_service', label: 'Custom Service' },
];

type CreateStep = 'select_customer' | 'select_service' | 'service_details' | 'assign_worker' | 'schedule' | 'review';

function CreateJobModal({ onClose }: { onClose: () => void }) {
  const { data: customers } = useCustomers();
  const { data: staff } = useStaff();
  const createJob = useCreateJob();

  const [step, setStep] = useState<CreateStep>('select_customer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Customer
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // Step 2: Multi-service type selection
  const [selectedServiceTypes, setSelectedServiceTypes] = useState<ServiceType[]>([]);

  // Step 3: Multi-item per service
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [currentServiceIdx, setCurrentServiceIdx] = useState(0);

  // Step 4: Worker
  const [technicianId, setTechnicianId] = useState('');

  // Step 5: Schedule
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobNotes, setJobNotes] = useState('');

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  const toggleServiceType = (st: ServiceType) => {
    setSelectedServiceTypes((prev) => {
      const exists = prev.includes(st);
      if (exists) return prev.filter((s) => s !== st);
      return [...prev, st];
    });
  };

  const initServiceGroups = () => {
    const groups: ServiceGroup[] = selectedServiceTypes.map((st) => {
      const existing = serviceGroups.find(g => g.serviceType === st);
      if (existing) return existing;
      return {
        serviceType: st,
        items: [createDefaultItem(st)],
        totalPrice: 0,
      };
    });
    setServiceGroups(groups);
  };

  const createDefaultItem = (st: ServiceType): ServiceItem => {
    const base: ServiceItem = { id: generateItemId(), quantity: 1, price: 0 };
    switch (st) {
      case 'standard_cleaning':
      case 'deep_cleaning':
        return { ...base, capacity: 1000 };
      case 'sofa_cleaning':
        return { ...base, sofaType: 'Standard' };
      case 'seats_cleaning':
        return base;
      case 'carpet_cleaning':
        return { ...base, carpetArea: 100 };
      case 'custom_service':
        return { ...base, serviceName: '' };
      default:
        return base;
    }
  };

  const addServiceItem = (groupIdx: number) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      return { ...g, items: [...g.items, createDefaultItem(g.serviceType)] };
    }));
  };

  const removeServiceItem = (groupIdx: number, itemIdx: number) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      if (g.items.length <= 1) return g;
      return { ...g, items: g.items.filter((_, j) => j !== itemIdx) };
    }));
  };

  const updateServiceItem = (groupIdx: number, itemIdx: number, updates: Partial<ServiceItem>) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      const newItems = g.items.map((item, j) => j === itemIdx ? { ...item, ...updates } : item);
      const totalPrice = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      return { ...g, items: newItems, totalPrice };
    }));
  };

  const getGroupTotal = (group: ServiceGroup): number => {
    return group.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const totalCharge = serviceGroups.reduce((sum, g) => sum + (g.totalPrice || getGroupTotal(g)), 0);

  const buildTriggerCompatDetails = (groups: ServiceGroup[]): Record<string, unknown> => {
    const details: Record<string, unknown> = {
      services: groups.map(g => ({
        serviceType: g.serviceType,
        items: g.items,
        totalPrice: g.totalPrice || getGroupTotal(g),
      })),
      totalCharge: groups.reduce((sum, g) => sum + (g.totalPrice || getGroupTotal(g)), 0),
    };

    const primary = groups[0];
    if (primary) {
      if (primary.serviceType === 'standard_cleaning' || primary.serviceType === 'deep_cleaning') {
        const totalCapacity = primary.items.reduce((sum, item) => sum + ((item.capacity ?? 1000) * (item.quantity ?? 1)), 0);
        const totalTanks = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
        const avgCapacity = totalTanks > 0 ? Math.round(totalCapacity / totalTanks) : 1000;
        details.tankCount = totalTanks;
        details.tankCapacity = avgCapacity;
        details.totalCapacity = totalCapacity;
      } else if (primary.serviceType === 'sofa_cleaning') {
        details.sofaCount = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
        details.sofaType = primary.items[0]?.sofaType ?? 'Standard';
      } else if (primary.serviceType === 'seats_cleaning') {
        details.seatCount = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
      } else if (primary.serviceType === 'carpet_cleaning') {
        details.carpetArea = primary.items.reduce((sum, item) => sum + ((item.carpetArea ?? 0) * (item.quantity ?? 1)), 0);
      }
    }

    details.serviceType = primary?.serviceType ?? 'standard_cleaning';
    return details;
  };

  const handleCreate = async () => {
    setError('');
    setSubmitting(true);

    try {
      let customerId = selectedCustomerId;

      if (showNewCustomer) {
        if (!newCustomerName || !newCustomerPhone) {
          setError('Customer name and phone are required');
          setSubmitting(false);
          return;
        }
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            name: newCustomerName,
            phone: newCustomerPhone,
            address: newCustomerAddress || null,
          })
          .select()
          .single();
        if (custErr) {
          console.error('Create customer error:', custErr);
          throw new Error(`Failed to create customer: ${custErr.message}`);
        }
        customerId = (newCust as Record<string, unknown>).id as string;
      }

      if (!customerId) {
        setError('Please select or create a customer');
        setSubmitting(false);
        return;
      }

      if (serviceGroups.length === 0) {
        setError('Please select at least one service');
        setSubmitting(false);
        return;
      }

      const primaryGroup = serviceGroups[0];

      const result = await createJob.mutateAsync({
        customerId,
        serviceType: primaryGroup.serviceType,
        serviceDetails: buildTriggerCompatDetails(serviceGroups),
        serviceDate,
        technicianId: technicianId || undefined,
        notes: jobNotes || undefined,
        services: serviceGroups,
      });

      if (!result) {
        throw new Error('Job was not created — no response from server');
      }

      onClose();
    } catch (err) {
      console.error('Job creation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepOrder: CreateStep[] = ['select_customer', 'select_service', 'service_details', 'assign_worker', 'schedule', 'review'];

  const renderStep = () => {
    switch (step) {
      case 'select_customer':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Select Customer</h3>
            {!showNewCustomer ? (
              <>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {customers?.map((c) => (
                    <button key={c.id} onClick={() => setSelectedCustomerId(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCustomerId === c.id ? 'bg-navy-50 text-navy-700 border border-navy-200' : 'hover:bg-surface-50 dark:hover:bg-surface-700/50 border border-transparent'
                      }`}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-surface-400 dark:text-surface-500 ml-2">{c.phone}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowNewCustomer(true); setSelectedCustomerId(''); }}
                  className="text-xs text-navy-600 hover:text-navy-700 font-medium">+ Create New Customer</button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-surface-600 dark:text-surface-400">Name *</label>
                    <ContactPicker onSelect={(c) => { if (c.name) setNewCustomerName(c.name); if (c.phone) setNewCustomerPhone(c.phone); }} />
                  </div>
                  <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Phone *</label>
                  <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="10-digit number"
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Address</label>
                  <input value={newCustomerAddress} onChange={e => setNewCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                </div>
                <button onClick={() => { setShowNewCustomer(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerAddress(''); }}
                  className="text-xs text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 font-medium">← Select existing customer</button>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <NextBtn disabled={!selectedCustomerId && !(showNewCustomer && newCustomerName && newCustomerPhone)} onClick={() => setStep('select_service')} />
            </div>
          </div>
        );

      case 'select_service':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Select Services</h3>
            <p className="text-xs text-surface-400 dark:text-surface-500">Select one or more services for this job</p>
            <div className="grid grid-cols-1 gap-2">
              {serviceOptions.map((opt) => {
                const isSelected = selectedServiceTypes.includes(opt.value);
                return (
                  <button key={opt.value} onClick={() => toggleServiceType(opt.value)}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors border ${
                      isSelected ? 'bg-navy-50 text-navy-700 border-navy-200 ring-2 ring-navy-200' : 'hover:bg-surface-50 dark:hover:bg-surface-700/50 border-surface-200 dark:border-surface-700'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-navy-600 border-navy-600' : 'border-surface-300'}`}>
                        {isSelected && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                      <span>{opt.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('select_customer')} />
              <NextBtn disabled={selectedServiceTypes.length === 0} onClick={() => { initServiceGroups(); setCurrentServiceIdx(0); setStep('service_details'); }} />
            </div>
          </div>
        );

      case 'service_details': {
        const group = serviceGroups[currentServiceIdx];
        if (!group) return <div>No service selected</div>;
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">{SERVICE_TYPE_LABELS[group.serviceType as ServiceType]} — Items</h3>
              <span className="text-xs text-surface-400 dark:text-surface-500">Service {currentServiceIdx + 1} of {serviceGroups.length}</span>
            </div>

            <div className="space-y-3">
              {group.items.map((item, itemIdx) => (
                <div key={item.id} className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">Item {itemIdx + 1}</span>
                    {group.items.length > 1 && (
                      <button onClick={() => removeServiceItem(currentServiceIdx, itemIdx)}
                        className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={12} /></button>
                    )}
                  </div>

                  {(group.serviceType === 'standard_cleaning' || group.serviceType === 'deep_cleaning') && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Capacity (L)</label>
                        <select value={item.capacity ?? 1000} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { capacity: parseInt(e.target.value) })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white">
                          <option value={500}>500L</option>
                          <option value={1000}>1000L</option>
                          <option value={1500}>1500L</option>
                          <option value={2000}>2000L</option>
                          <option value={3000}>3000L</option>
                          <option value={5000}>5000L</option>
                          <option value={10000}>10000L</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Quantity</label>
                        <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    </div>
                  )}

                  {group.serviceType === 'sofa_cleaning' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Type</label>
                        <select value={item.sofaType ?? 'Standard'} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { sofaType: e.target.value })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white">
                          <option value="Standard">Standard</option>
                          <option value="L-Shape">L-Shape</option>
                          <option value="Sectional">Sectional</option>
                          <option value="Recliner">Recliner</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Quantity</label>
                        <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                      </div>
                    </div>
                  )}

                  {group.serviceType === 'seats_cleaning' && (
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Quantity</label>
                      <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  )}

                  {group.serviceType === 'carpet_cleaning' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Area (sq ft)</label>
                        <input type="number" min={1} value={item.carpetArea ?? 100} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { carpetArea: parseInt(e.target.value) || 100 })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Quantity</label>
                        <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                          className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                      </div>
                    </div>
                  )}

                  {group.serviceType === 'custom_service' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Name</label>
                        <input value={item.serviceName ?? ''} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { serviceName: e.target.value })}
                          placeholder="e.g. Window Cleaning" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Quantity</label>
                          <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Notes</label>
                          <input value={item.notes ?? ''} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { notes: e.target.value })}
                            className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Unit Price (₹)</label>
                    <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(currentServiceIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                      placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => addServiceItem(currentServiceIdx)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-navy-600 bg-navy-50 hover:bg-navy-100 py-2 rounded-lg transition-colors">
              <Plus size={12} /> Add Another Item
            </button>

            <div className="bg-surface-100 dark:bg-surface-700 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-surface-600 dark:text-surface-300 font-medium">Service Subtotal</span>
              <span className="font-bold text-surface-900 dark:text-white">₹{(group.totalPrice || getGroupTotal(group)).toLocaleString('en-IN')}</span>
            </div>

            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => {
                if (currentServiceIdx > 0) setCurrentServiceIdx(i => i - 1);
                else setStep('select_service');
              }} />
              {currentServiceIdx < serviceGroups.length - 1 ? (
                <NextBtn onClick={() => setCurrentServiceIdx(i => i + 1)} />
              ) : (
                <NextBtn onClick={() => setStep('assign_worker')} />
              )}
            </div>
          </div>
        );
      }

      case 'assign_worker':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Assign Worker</h3>
            <div className="space-y-1">
              <button onClick={() => setTechnicianId('')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!technicianId ? 'bg-navy-50 text-navy-700 border border-navy-200' : 'hover:bg-surface-50 dark:hover:bg-surface-700/50 border border-transparent'}`}>
                <span className="font-medium">Unassigned</span>
              </button>
              {staff?.map((s) => (
                <button key={s.id} onClick={() => setTechnicianId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${technicianId === s.id ? 'bg-navy-50 text-navy-700 border border-navy-200' : 'hover:bg-surface-50 dark:hover:bg-surface-700/50 border border-transparent'}`}>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-surface-400 dark:text-surface-500 ml-2">{WAGE_TYPE_LABELS[s.wage_type ?? 'daily']} · ₹{(s.wage_amount || s.daily_wage_inr).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('service_details')} />
              <NextBtn onClick={() => setStep('schedule')} />
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Schedule</h3>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Service Date</label>
              <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 bg-white dark:bg-surface-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Notes</label>
              <textarea value={jobNotes} onChange={e => setJobNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none bg-white dark:bg-surface-700 dark:text-white"
                placeholder="Optional job notes" />
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('assign_worker')} />
              <NextBtn onClick={() => setStep('review')} />
            </div>
          </div>
        );

      case 'review': {
        const customerName = showNewCustomer ? newCustomerName : selectedCustomer?.name;
        const workerName = staff?.find(s => s.id === technicianId)?.name ?? 'Unassigned';
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Review & Create</h3>
            <div className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-surface-500 dark:text-surface-400">Customer</span><span className="font-medium">{customerName}</span></div>
              <div className="flex justify-between"><span className="text-surface-500 dark:text-surface-400">Worker</span><span className="font-medium">{workerName}</span></div>
              <div className="flex justify-between"><span className="text-surface-500 dark:text-surface-400">Date</span><span className="font-medium">{format(new Date(serviceDate), 'dd MMM yyyy')}</span></div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">Services ({serviceGroups.length})</h4>
              <div className="space-y-2">
                {serviceGroups.map((svc, idx) => (
                  <div key={idx} className="border border-surface-200 dark:border-surface-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-surface-900 dark:text-white">{SERVICE_TYPE_LABELS[svc.serviceType as ServiceType]}</p>
                      {(svc.totalPrice || getGroupTotal(svc)) > 0 && (
                        <span className="text-sm font-semibold text-green-600">₹{(svc.totalPrice || getGroupTotal(svc)).toLocaleString('en-IN')}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {svc.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-center justify-between text-xs text-surface-600 dark:text-surface-300">
                          <div>
                            <span>{formatItemDetail(item, svc.serviceType)}</span>
                            <span className="text-surface-400 ml-2">Qty: {item.quantity}{item.price > 0 ? ` · ₹${item.price.toLocaleString('en-IN')}/unit` : ''}</span>
                          </div>
                          {item.price > 0 && <span className="text-green-600 ml-2">₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {totalCharge > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-green-800">Total</span>
                <span className="text-lg font-bold text-green-800">₹{totalCharge.toLocaleString('en-IN')}</span>
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('schedule')} />
              <button onClick={handleCreate} disabled={submitting}
                className="bg-navy-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Schedule cleaning</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400">Step {stepOrder.indexOf(step) + 1} of 6</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <div className="p-5">{renderStep()}</div>
      </div>
    </div>
  );
}

// ─── Edit Job Modal ──────────────────────────────────────────────

function parseCardToServiceGroups(card: ServiceCardWithDetails): ServiceGroup[] {
  const d = card.service_details as Record<string, unknown>;
  if (d && Array.isArray(d.services)) {
    return (d.services as ServiceGroup[]).map(g => ({
      ...g,
      items: g.items.map(item => ({
        ...item,
        price: item.price ?? 0,
      })),
      totalPrice: g.totalPrice ?? 0,
    }));
  }
  const items: ServiceItem[] = [{
    id: generateItemId(),
    quantity: 1,
    price: 0,
    capacity: d?.tankCapacity as number | undefined,
    sofaType: d?.sofaType as string | undefined,
    carpetArea: d?.carpetArea as number | undefined,
    serviceName: d?.serviceName as string | undefined,
    notes: d?.notes as string | undefined,
  }];
  return [{ serviceType: card.service_type as ServiceType, items, totalPrice: 0 }];
}

function createDefaultEditItem(st: ServiceType): ServiceItem {
  const base: ServiceItem = { id: generateItemId(), quantity: 1, price: 0 };
  switch (st) {
    case 'standard_cleaning':
    case 'deep_cleaning':
      return { ...base, capacity: 1000 };
    case 'sofa_cleaning':
      return { ...base, sofaType: 'Standard' };
    case 'seats_cleaning':
      return base;
    case 'carpet_cleaning':
      return { ...base, carpetArea: 100 };
    case 'custom_service':
      return { ...base, serviceName: '' };
    default:
      return base;
  }
}

function EditJobModal({ card, onClose }: { card: ServiceCardWithDetails; onClose: () => void }) {
  const { data: customers } = useCustomers();
  const { data: staff } = useStaff();
  const updateJob = useUpdateJob();

  const [customerId, setCustomerId] = useState(card.customer_id);
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>(() => parseCardToServiceGroups(card));
  const [serviceDate, setServiceDate] = useState(card.service_date);
  const [technicianId, setTechnicianId] = useState(card.technician_id ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAddService, setShowAddService] = useState(false);

  const addServiceItem = (groupIdx: number) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      return { ...g, items: [...g.items, createDefaultEditItem(g.serviceType)] };
    }));
  };

  const removeServiceItem = (groupIdx: number, itemIdx: number) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      if (g.items.length <= 1) return g;
      return { ...g, items: g.items.filter((_, j) => j !== itemIdx) };
    }));
  };

  const updateServiceItem = (groupIdx: number, itemIdx: number, updates: Partial<ServiceItem>) => {
    setServiceGroups(prev => prev.map((g, i) => {
      if (i !== groupIdx) return g;
      const newItems = g.items.map((item, j) => j === itemIdx ? { ...item, ...updates } : item);
      const totalPrice = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      return { ...g, items: newItems, totalPrice };
    }));
  };

  const addServiceGroup = (st: ServiceType) => {
    setServiceGroups(prev => [...prev, {
      serviceType: st,
      items: [createDefaultEditItem(st)],
      totalPrice: 0,
    }]);
    setShowAddService(false);
  };

  const removeServiceGroup = (groupIdx: number) => {
    setServiceGroups(prev => prev.filter((_, i) => i !== groupIdx));
  };

  const totalCharge = serviceGroups.reduce((sum, g) => sum + getGroupTotal(g), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { setError('Please select a customer'); return; }
    if (serviceGroups.length === 0) { setError('Please add at least one service'); return; }
    setError('');
    setSubmitting(true);
    try {
      const details = buildServiceDetails(serviceGroups);
      const primaryType = serviceGroups[0].serviceType;
      await updateJob.mutateAsync({
        id: card.id,
        customerId,
        serviceType: primaryType,
        serviceDetails: details,
        serviceDate,
        technicianId: technicianId || undefined,
        notes: notes || undefined,
        services: serviceGroups,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedServiceTypes = serviceGroups.map(g => g.serviceType);
  const availableServiceTypes = serviceOptions.filter(opt => !selectedServiceTypes.includes(opt.value));

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Edit job</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">Modify services and job details</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Customer</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input-base" required>
              <option value="">Select customer</option>
              {customers?.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Services ({serviceGroups.length})</h3>
              {availableServiceTypes.length > 0 && (
                <button type="button" onClick={() => setShowAddService(true)}
                  className="text-xs font-medium text-navy-600 dark:text-navy-400 hover:text-navy-700 flex items-center gap-1">
                  <Plus size={12} /> Add Service
                </button>
              )}
            </div>

            {showAddService && (
              <div className="mb-3 p-3 border border-navy-200 dark:border-navy-700 bg-navy-50 dark:bg-navy-900/50 rounded-xl">
                <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-2">Select service type to add:</p>
                <div className="space-y-1">
                  {availableServiceTypes.map(opt => (
                    <button key={opt.value} type="button" onClick={() => addServiceGroup(opt.value)}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-navy-100 dark:hover:bg-navy-800 transition-colors text-surface-700 dark:text-surface-200">
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowAddService(false)}
                  className="text-xs text-surface-400 hover:text-surface-600 mt-1">Cancel</button>
              </div>
            )}

            <div className="space-y-3">
              {serviceGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-surface-50 dark:bg-surface-800/50 px-3 py-2">
                    <span className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">
                      {SERVICE_TYPE_LABELS[group.serviceType as ServiceType] ?? group.serviceType}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono font-medium text-cyan-600 dark:text-cyan-400">₹{getGroupTotal(group).toLocaleString('en-IN')}</span>
                      <button type="button" onClick={() => removeServiceGroup(groupIdx)}
                        className="text-surface-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {group.items.map((item, itemIdx) => (
                      <div key={item.id} className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 uppercase">Item {itemIdx + 1}</span>
                          {group.items.length > 1 && (
                            <button type="button" onClick={() => removeServiceItem(groupIdx, itemIdx)}
                              className="text-red-400 hover:text-red-600 transition-colors"><X size={12} /></button>
                          )}
                        </div>

                        {(group.serviceType === 'standard_cleaning' || group.serviceType === 'deep_cleaning') && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Capacity</label>
                              <select value={item.capacity ?? 1000} onChange={e => updateServiceItem(groupIdx, itemIdx, { capacity: parseInt(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white">
                                <option value={500}>500L</option>
                                <option value={1000}>1000L</option>
                                <option value={1500}>1500L</option>
                                <option value={2000}>2000L</option>
                                <option value={3000}>3000L</option>
                                <option value={5000}>5000L</option>
                                <option value={10000}>10000L</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                              <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                              <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                                placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                          </div>
                        )}

                        {group.serviceType === 'sofa_cleaning' && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Type</label>
                              <select value={item.sofaType ?? 'Standard'} onChange={e => updateServiceItem(groupIdx, itemIdx, { sofaType: e.target.value })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white">
                                <option value="Standard">Seater</option>
                                <option value="L-Shape">L-Shape</option>
                                <option value="Sectional">Sectional</option>
                                <option value="Recliner">Recliner</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                              <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                              <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                                placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                          </div>
                        )}

                        {group.serviceType === 'seats_cleaning' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                              <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                              <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                                placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                          </div>
                        )}

                        {group.serviceType === 'carpet_cleaning' && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Area</label>
                              <input type="number" min={1} value={item.carpetArea ?? 100} onChange={e => updateServiceItem(groupIdx, itemIdx, { carpetArea: parseInt(e.target.value) || 100 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                              <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                              <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                                placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                          </div>
                        )}

                        {group.serviceType === 'custom_service' && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Name</label>
                              <input value={item.serviceName ?? ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { serviceName: e.target.value })}
                                placeholder="e.g. Window" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                              <input type="number" min={1} value={item.quantity} onChange={e => updateServiceItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                              <input type="number" min={0} value={item.price || ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                                placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Notes (optional)</label>
                          <input value={item.notes ?? ''} onChange={e => updateServiceItem(groupIdx, itemIdx, { notes: e.target.value })}
                            placeholder="Item notes" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => addServiceItem(groupIdx)}
                      className="w-full flex items-center justify-center gap-1 text-xs font-medium text-navy-600 dark:text-navy-400 hover:text-navy-700 py-1.5 rounded-lg border border-dashed border-surface-300 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                      <Plus size={12} /> Add Item
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {serviceGroups.length === 0 && (
              <div className="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-xl p-6 text-center">
                <p className="text-xs text-surface-400 dark:text-surface-500 mb-2">No services added yet</p>
                {availableServiceTypes.length > 0 && (
                  <button type="button" onClick={() => setShowAddService(true)}
                    className="text-xs font-medium text-navy-600 dark:text-navy-400">+ Add a service</button>
                )}
              </div>
            )}

            {totalCharge > 0 && (
              <div className="bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 rounded-xl p-3 flex items-center justify-between mt-3">
                <span className="text-sm font-display font-semibold text-cyan-700 dark:text-cyan-300">Total</span>
                <span className="font-mono text-lg font-bold text-cyan-700 dark:text-cyan-300">₹{totalCharge.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Service date</label>
            <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Worker</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className="input-base">
              <option value="">Unassigned</option>
              {staff?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-base resize-none" />
          </div>
          {error && <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-xl px-3 py-2">{error}</div>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Job Confirmation ─────────────────────────────────────

function DeleteJobConfirmModal({ card, onClose }: { card: ServiceCardWithDetails; onClose: () => void }) {
  const [error, setError] = useState('');
  const deleteJob = useDeleteJob();

  const handleDelete = async () => {
    setError('');
    try {
      await deleteJob.mutateAsync({ id: card.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-sm shadow-xl p-5 border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Delete job</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <p className="text-body-sm text-surface-600 dark:text-surface-300 mb-2">
          Delete the job for <strong>{card.customers?.name}</strong>?
        </p>
        <p className="text-body-xs text-surface-500 dark:text-surface-400 mb-4">
          This cannot be undone. Inventory transactions linked to this job will also be removed.
        </p>
        {error && <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-xl px-3 py-2 mb-4">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="px-4 py-2.5 rounded-xl text-sm font-display font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

function NextBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-primary disabled:opacity-50">
      Next <ChevronRight size={14} />
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="btn-ghost">← Back</button>;
}
