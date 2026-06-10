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
  PlusCircle,
} from 'lucide-react';
import type { JobStatus, ServiceCardWithDetails, ServiceType } from '../lib/types';
import {
  SERVICE_TYPE_LABELS,
} from '../lib/types';
import type {
  TankCleaningDetails,
  SofaCleaningDetails,
  SeatsCleaningDetails,
  CarpetCleaningDetails,
  CustomServiceDetails,
  ServiceDetails,
} from '../lib/types';
import { TableSkeleton } from '../components/LoadingSkeleton';

const columns: { status: JobStatus; label: string; icon: typeof CircleDot; color: string }[] = [
  {
    status: 'pending',
    label: 'Pending',
    icon: CircleDot,
    color: 'text-amber-600',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    icon: Clock,
    color: 'text-blue-600',
  },
  {
    status: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-green-600',
  },
];

export default function Jobs() {
  const { data: allCards, isLoading } = useServiceCards();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJob, setEditingJob] = useState<ServiceCardWithDetails | null>(null);
  const [deletingJob, setDeletingJob] = useState<ServiceCardWithDetails | null>(null);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track and manage service jobs across all stages
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Create Job
        </button>
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
                    <JobCard
                      key={card.id}
                      card={card}
                      onEdit={() => setEditingJob(card)}
                      onDelete={() => setDeletingJob(card)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreateModal && (
        <CreateJobModal onClose={() => setShowCreateModal(false)} />
      )}
      {editingJob && (
        <EditJobModal
          card={editingJob}
          onClose={() => setEditingJob(null)}
        />
      )}
      {deletingJob && (
        <DeleteJobConfirmModal
          card={deletingJob}
          onClose={() => setDeletingJob(null)}
        />
      )}
    </div>
  );
}

// ─── Service Details Display ────────────────────────────────────

function ServiceItemDetails({ service }: { service: { service_type: string; service_details: unknown } }) {
  const d = service.service_details as Record<string, unknown>;

  const n = (v: unknown) => String(v ?? '');
  const num = (v: unknown, fallback: number) => {
    const parsed = typeof v === 'number' ? v : Number(v);
    return isNaN(parsed) ? fallback : parsed;
  };

  switch (service.service_type) {
    case 'standard_cleaning':
    case 'deep_cleaning': {
      const tankCount = num(d.tankCount, 1);
      const tankCapacity = num(d.tankCapacity, 1000);
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{tankCount} Tank{tankCount !== 1 ? 's' : ''} of {tankCapacity}L</p>
        </div>
      );
    }
    case 'sofa_cleaning': {
      const sofaCount = num(d.sofaCount, 1);
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{sofaCount} Sofa{sofaCount !== 1 ? 's' : ''}</p>
          <p>Type: {n(d.sofaType)}</p>
        </div>
      );
    }
    case 'seats_cleaning': {
      const seatCount = num(d.seatCount, 1);
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{seatCount} Seat{seatCount !== 1 ? 's' : ''}</p>
        </div>
      );
    }
    case 'carpet_cleaning': {
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>Area: {n(d.carpetArea)} sq ft</p>
          {d.notes ? <p className="italic">{n(d.notes)}</p> : null}
        </div>
      );
    }
    case 'custom_service': {
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p className="font-medium">{n(d.serviceName)}</p>
          {d.notes ? <p className="italic">{n(d.notes)}</p> : null}
        </div>
      );
    }
    default:
      return null;
  }
}

function ServiceDetailsDisplay({ card }: { card: ServiceCardWithDetails }) {
  if (card.job_services && card.job_services.length > 0) {
    return (
      <div className="space-y-1.5">
        {card.job_services.map((js) => (
          <div key={js.id} className="border-l-2 border-blue-200 pl-2">
            <p className="text-[10px] font-semibold text-blue-600 mb-0.5">
              {SERVICE_TYPE_LABELS[js.service_type as ServiceType] ?? js.service_type}
            </p>
            <ServiceItemDetails service={js} />
            {js.notes && <p className="text-xs text-slate-400 italic mt-0.5">{js.notes}</p>}
          </div>
        ))}
      </div>
    );
  }

  const details = card.service_details as Record<string, unknown>;

  switch (card.service_type) {
    case 'standard_cleaning':
    case 'deep_cleaning': {
      const d = details as unknown as TankCleaningDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{d.tankCount} Tank{d.tankCount !== 1 ? 's' : ''} of {d.tankCapacity}L</p>
        </div>
      );
    }
    case 'sofa_cleaning': {
      const d = details as unknown as SofaCleaningDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{d.sofaCount} Sofa{d.sofaCount !== 1 ? 's' : ''}</p>
          <p>Type: {d.sofaType}</p>
        </div>
      );
    }
    case 'seats_cleaning': {
      const d = details as unknown as SeatsCleaningDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{d.seatCount} Seat{d.seatCount !== 1 ? 's' : ''}</p>
        </div>
      );
    }
    case 'carpet_cleaning': {
      const d = details as unknown as CarpetCleaningDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>Area: {d.carpetArea} sq ft</p>
          {d.notes && <p className="italic">{d.notes}</p>}
        </div>
      );
    }
    case 'custom_service': {
      const d = details as unknown as CustomServiceDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p className="font-medium">{d.serviceName}</p>
          {d.notes && <p className="italic">{d.notes}</p>}
        </div>
      );
    }
    default:
      return null;
  }
}

// ─── Job Card ───────────────────────────────────────────────────

function JobCard({
  card,
  onEdit,
  onDelete,
}: {
  card: ServiceCardWithDetails;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const updateStatus = useUpdateJobStatus();
  const sendFeedback = useSendFeedback();

  const statusOptions: { value: JobStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  const serviceLabel =
    card.job_services && card.job_services.length > 0
      ? card.job_services
          .map((js) => SERVICE_TYPE_LABELS[js.service_type as ServiceType] ?? js.service_type)
          .join(', ')
      : SERVICE_TYPE_LABELS[card.service_type as ServiceType] ?? card.service_type;

  const workers =
    card.job_workers && card.job_workers.length > 0
      ? card.job_workers.map((jw) => jw.staff.name)
      : card.staff
        ? [card.staff.name]
        : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow relative">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {card.customers?.name}
          </h3>
          <p className="text-[10px] font-medium text-blue-600 mt-0.5">
            {serviceLabel}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1 ${
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
      </div>

      <ServiceDetailsDisplay card={card} />

      <div className="space-y-1 mt-2 mb-3">
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Calendar size={10} />
          {format(new Date(card.service_date), 'dd MMM yyyy')}
        </p>
        {workers.length > 0 && (
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <User size={10} />
            {workers.join(', ')}
          </p>
        )}
        {card.notes && (
          <p className="text-xs text-slate-400 italic flex items-center gap-1">
            <FileText size={10} />
            {card.notes}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={card.job_status}
          onChange={(e) => {
            const newStatus = e.target.value as JobStatus;
            if (newStatus !== card.job_status) {
              updateStatus.mutate({ id: card.id, status: newStatus });
            }
          }}
          disabled={updateStatus.isPending}
          className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
            card.job_status === 'pending'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : card.job_status === 'in_progress'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-green-50 text-green-700 border-green-200'
          }`}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {card.job_status === 'completed' && !card.feedback_sent && (
        <button
          onClick={() => sendFeedback.mutate({ cardId: card.id, rating: 'good' })}
          disabled={sendFeedback.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Star size={12} />
          Send Feedback Request
        </button>
      )}

      {card.job_status === 'completed' && card.feedback_sent && (
        <div className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 py-2 rounded-lg">
          <CheckCircle2 size={12} />
          Feedback Sent
        </div>
      )}
    </div>
  );
}

// ─── Multi-service helpers ──────────────────────────────────────

let svcKeyCounter = 0;
function nextSvcKey(): string {
  return `svc_${++svcKeyCounter}`;
}

interface ServiceEntry {
  key: string;
  serviceType: ServiceType;
  tankCount: string;
  tankCapacity: string;
  sofaCount: string;
  sofaType: string;
  seatCount: string;
  carpetArea: string;
  carpetNotes: string;
  customName: string;
  customNotes: string;
  notes: string;
}

function createServiceEntry(type: ServiceType): ServiceEntry {
  return {
    key: nextSvcKey(),
    serviceType: type,
    tankCount: '1',
    tankCapacity: '1000',
    sofaCount: '1',
    sofaType: 'Standard',
    seatCount: '1',
    carpetArea: '100',
    carpetNotes: '',
    customName: '',
    customNotes: '',
    notes: '',
  };
}

function serviceEntryToPayload(entry: ServiceEntry): {
  serviceType: ServiceType;
  serviceDetails: ServiceDetails;
  notes?: string;
} {
  let details: ServiceDetails;
  switch (entry.serviceType) {
    case 'standard_cleaning':
    case 'deep_cleaning': {
      const tc = parseInt(entry.tankCount) || 1;
      const tcap = parseInt(entry.tankCapacity) || 1000;
      details = { tankCount: tc, tankCapacity: tcap, totalCapacity: tc * tcap };
      break;
    }
    case 'sofa_cleaning':
      details = { sofaCount: parseInt(entry.sofaCount) || 1, sofaType: entry.sofaType };
      break;
    case 'seats_cleaning':
      details = { seatCount: parseInt(entry.seatCount) || 1 };
      break;
    case 'carpet_cleaning':
      details = { carpetArea: parseInt(entry.carpetArea) || 100, notes: entry.carpetNotes || undefined };
      break;
    case 'custom_service':
      details = { serviceName: entry.customName, notes: entry.customNotes || undefined };
      break;
  }
  return { serviceType: entry.serviceType, serviceDetails: details, notes: entry.notes || undefined };
}

const serviceOptions: { value: ServiceType; label: string }[] = [
  { value: 'standard_cleaning', label: 'Water Tank Cleaning' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'sofa_cleaning', label: 'Sofa Cleaning' },
  { value: 'seats_cleaning', label: 'Seats Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'custom_service', label: 'Custom Service' },
];

// ─── Create Job Modal ────────────────────────────────────────────

type CreateStep = 'select_customer' | 'add_services' | 'assign_workers' | 'schedule' | 'review';

const CREATE_STEPS: CreateStep[] = ['select_customer', 'add_services', 'assign_workers', 'schedule', 'review'];

function CreateJobModal({ onClose }: { onClose: () => void }) {
  const { data: customers } = useCustomers();
  const { data: staff } = useStaff();
  const createJob = useCreateJob();

  const [step, setStep] = useState<CreateStep>('select_customer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Customer
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // Services
  const [services, setServices] = useState<ServiceEntry[]>([createServiceEntry('standard_cleaning')]);

  // Workers
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);

  // Schedule
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobNotes, setJobNotes] = useState('');

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  const updateService = (key: string, patch: Partial<ServiceEntry>) => {
    setServices(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s));
  };

  const removeService = (key: string) => {
    setServices(prev => prev.filter(s => s.key !== key));
  };

  const addService = (type: ServiceType) => {
    setServices(prev => [...prev, createServiceEntry(type)]);
  };

  const toggleWorker = (id: string) => {
    setSelectedWorkerIds(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
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
        if (custErr) throw custErr;
        customerId = (newCust as any).id;
      }

      if (!customerId) {
        setError('Please select or create a customer');
        setSubmitting(false);
        return;
      }

      const servicesPayload = services.map(serviceEntryToPayload);

      await createJob.mutateAsync({
        customerId,
        services: servicesPayload,
        workerIds: selectedWorkerIds,
        serviceDate,
        notes: jobNotes || undefined,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'select_customer':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Select Customer</h3>
            {!showNewCustomer ? (
              <>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {customers?.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCustomerId === c.id
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-slate-400 ml-2">{c.phone}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setShowNewCustomer(true); setSelectedCustomerId(''); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Create New Customer
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                  <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
                  <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                    placeholder="10-digit number"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                  <input value={newCustomerAddress} onChange={e => setNewCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button
                  onClick={() => { setShowNewCustomer(false); setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerAddress(''); }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  ← Select existing customer
                </button>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <NextBtn
                disabled={!selectedCustomerId && !(showNewCustomer && newCustomerName && newCustomerPhone)}
                onClick={() => setStep('add_services')}
              />
            </div>
          </div>
        );

      case 'add_services':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Services</h3>
            <div className="space-y-4">
              {services.map((svc, idx) => (
                <div key={svc.key} className="border border-slate-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Service {idx + 1}</span>
                    {services.length > 1 && (
                      <button
                        onClick={() => removeService(svc.key)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Remove service"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                    <select
                      value={svc.serviceType}
                      onChange={e => updateService(svc.key, { serviceType: e.target.value as ServiceType })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {serviceOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {(svc.serviceType === 'standard_cleaning' || svc.serviceType === 'deep_cleaning') && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Number of Tanks</label>
                        <input type="number" value={svc.tankCount}
                          onChange={e => updateService(svc.key, { tankCount: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Capacity Per Tank (Liters)</label>
                        <input type="number" value={svc.tankCapacity}
                          onChange={e => updateService(svc.key, { tankCapacity: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </>
                  )}

                  {svc.serviceType === 'sofa_cleaning' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Sofa Count</label>
                        <input type="number" value={svc.sofaCount}
                          onChange={e => updateService(svc.key, { sofaCount: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Sofa Type</label>
                        <select value={svc.sofaType}
                          onChange={e => updateService(svc.key, { sofaType: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="Standard">Standard</option>
                          <option value="L-Shape">L-Shape</option>
                          <option value="Sectional">Sectional</option>
                          <option value="Recliner">Recliner</option>
                        </select>
                      </div>
                    </>
                  )}

                  {svc.serviceType === 'seats_cleaning' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Seat Count</label>
                      <input type="number" value={svc.seatCount}
                        onChange={e => updateService(svc.key, { seatCount: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  )}

                  {svc.serviceType === 'carpet_cleaning' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Area (sq ft)</label>
                        <input type="number" value={svc.carpetArea}
                          onChange={e => updateService(svc.key, { carpetArea: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                        <textarea value={svc.carpetNotes}
                          onChange={e => updateService(svc.key, { carpetNotes: e.target.value })} rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </div>
                    </>
                  )}

                  {svc.serviceType === 'custom_service' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Service Name *</label>
                        <input value={svc.customName}
                          onChange={e => updateService(svc.key, { customName: e.target.value })}
                          placeholder="e.g. Deep Cleaning"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                        <textarea value={svc.customNotes}
                          onChange={e => updateService(svc.key, { customNotes: e.target.value })} rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Service Notes</label>
                    <input value={svc.notes}
                      onChange={e => updateService(svc.key, { notes: e.target.value })}
                      placeholder="Optional per-service notes"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => addService('standard_cleaning')}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <PlusCircle size={14} />
              Add Another Service
            </button>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('select_customer')} />
              <NextBtn onClick={() => setStep('assign_workers')} />
            </div>
          </div>
        );

      case 'assign_workers':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Assign Workers</h3>
            <p className="text-xs text-slate-400">Select one or more workers for this job</p>
            <div className="space-y-1">
              {staff?.map((s) => {
                const checked = selectedWorkerIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                      checked
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWorker(s.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-slate-400 ml-auto">₹{s.daily_wage_inr}/day</span>
                  </label>
                );
              })}
            </div>
            {selectedWorkerIds.length === 0 && (
              <p className="text-xs text-amber-600">No workers selected — job will be unassigned</p>
            )}
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('add_services')} />
              <NextBtn onClick={() => setStep('schedule')} />
            </div>
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Schedule</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Service Date</label>
              <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Job Notes</label>
              <textarea value={jobNotes} onChange={e => setJobNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optional job-level notes" />
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('assign_workers')} />
              <NextBtn onClick={() => setStep('review')} />
            </div>
          </div>
        );

      case 'review': {
        const customerName = showNewCustomer ? newCustomerName : selectedCustomer?.name;
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Review & Create</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-medium">{customerName}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Services ({services.length})</span>
                <div className="space-y-1.5">
                  {services.map((svc) => {
                    const payload = serviceEntryToPayload(svc);
                    return (
                      <div key={svc.key} className="bg-white rounded px-2.5 py-1.5 text-xs">
                        <span className="font-medium text-blue-600">{SERVICE_TYPE_LABELS[svc.serviceType]}</span>
                        <span className="text-slate-400 ml-2">
                          {svc.serviceType === 'standard_cleaning' || svc.serviceType === 'deep_cleaning'
                            ? `${(payload.serviceDetails as TankCleaningDetails).totalCapacity}L`
                            : svc.serviceType === 'sofa_cleaning'
                            ? `${(payload.serviceDetails as SofaCleaningDetails).sofaCount} sofa(s)`
                            : svc.serviceType === 'seats_cleaning'
                            ? `${(payload.serviceDetails as SeatsCleaningDetails).seatCount} seat(s)`
                            : svc.serviceType === 'carpet_cleaning'
                            ? `${(payload.serviceDetails as CarpetCleaningDetails).carpetArea} sq ft`
                            : (payload.serviceDetails as CustomServiceDetails).serviceName}
                        </span>
                        {svc.notes && <p className="text-slate-400 italic mt-0.5">{svc.notes}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Workers</span>
                <span className="font-medium">
                  {selectedWorkerIds.length > 0
                    ? selectedWorkerIds.map(id => staff?.find(s => s.id === id)?.name).join(', ')
                    : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="font-medium">{format(new Date(serviceDate), 'dd MMM yyyy')}</span>
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
            )}
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('schedule')} />
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Job</h2>
            <p className="text-xs text-slate-400">
              Step {CREATE_STEPS.indexOf(step) + 1} of {CREATE_STEPS.length}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Job Modal ──────────────────────────────────────────────

function EditJobModal({
  card,
  onClose,
}: {
  card: ServiceCardWithDetails;
  onClose: () => void;
}) {
  const { data: customers } = useCustomers();
  const { data: staff } = useStaff();
  const updateJob = useUpdateJob();

  const [customerId, setCustomerId] = useState(card.customer_id);
  const [serviceDate, setServiceDate] = useState(card.service_date);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [services, setServices] = useState<ServiceEntry[]>(() => {
    if (card.job_services && card.job_services.length > 0) {
      return card.job_services.map(js => {
        const d = js.service_details as unknown as Record<string, unknown>;
        const entry = createServiceEntry(js.service_type as ServiceType);
        if (js.service_type === 'standard_cleaning' || js.service_type === 'deep_cleaning') {
          entry.tankCount = String(d.tankCount ?? 1);
          entry.tankCapacity = String(d.tankCapacity ?? 1000);
        } else if (js.service_type === 'sofa_cleaning') {
          entry.sofaCount = String(d.sofaCount ?? 1);
          entry.sofaType = (d.sofaType as string) ?? 'Standard';
        } else if (js.service_type === 'seats_cleaning') {
          entry.seatCount = String(d.seatCount ?? 1);
        } else if (js.service_type === 'carpet_cleaning') {
          entry.carpetArea = String(d.carpetArea ?? 100);
          entry.carpetNotes = (d.notes as string) ?? '';
        } else if (js.service_type === 'custom_service') {
          entry.customName = (d.serviceName as string) ?? '';
          entry.customNotes = (d.notes as string) ?? '';
        }
        entry.notes = js.notes ?? '';
        return entry;
      });
    }
    return [createServiceEntry((card.service_type as ServiceType) || 'standard_cleaning')];
  });

  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>(() => {
    if (card.job_workers && card.job_workers.length > 0) {
      return card.job_workers.map(jw => jw.staff_id);
    }
    if (card.technician_id) return [card.technician_id];
    return [];
  });

  const updateService = (key: string, patch: Partial<ServiceEntry>) => {
    setServices(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s));
  };

  const removeService = (key: string) => {
    setServices(prev => prev.filter(s => s.key !== key));
  };

  const addService = (type: ServiceType) => {
    setServices(prev => [...prev, createServiceEntry(type)]);
  };

  const toggleWorker = (id: string) => {
    setSelectedWorkerIds(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError('Please select a customer');
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      await updateJob.mutateAsync({
        id: card.id,
        customerId,
        services: services.map(serviceEntryToPayload),
        workerIds: selectedWorkerIds,
        serviceDate,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Edit Job</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Customer</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" required>
              <option value="">Select customer</option>
              {customers?.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Services</label>
              <button type="button" onClick={() => addService('standard_cleaning')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <PlusCircle size={12} /> Add
              </button>
            </div>
            {services.map((svc, idx) => (
              <div key={svc.key} className="border border-slate-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500">Service {idx + 1}</span>
                  {services.length > 1 && (
                    <button type="button" onClick={() => removeService(svc.key)}
                      className="text-red-400 hover:text-red-600" title="Remove">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <select value={svc.serviceType}
                  onChange={e => updateService(svc.key, { serviceType: e.target.value as ServiceType })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                  {serviceOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {(svc.serviceType === 'standard_cleaning' || svc.serviceType === 'deep_cleaning') && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tank Count</label>
                      <input type="number" value={svc.tankCount}
                        onChange={e => updateService(svc.key, { tankCount: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Capacity (L)</label>
                      <input type="number" value={svc.tankCapacity}
                        onChange={e => updateService(svc.key, { tankCapacity: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                  </>
                )}

                {svc.serviceType === 'sofa_cleaning' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Sofa Count</label>
                      <input type="number" value={svc.sofaCount}
                        onChange={e => updateService(svc.key, { sofaCount: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                    <select value={svc.sofaType}
                      onChange={e => updateService(svc.key, { sofaType: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                      <option value="Standard">Standard</option>
                      <option value="L-Shape">L-Shape</option>
                      <option value="Sectional">Sectional</option>
                      <option value="Recliner">Recliner</option>
                    </select>
                  </>
                )}

                {svc.serviceType === 'seats_cleaning' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Seat Count</label>
                    <input type="number" value={svc.seatCount}
                      onChange={e => updateService(svc.key, { seatCount: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                )}

                {svc.serviceType === 'carpet_cleaning' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Area (sq ft)</label>
                      <input type="number" value={svc.carpetArea}
                        onChange={e => updateService(svc.key, { carpetArea: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                      <textarea value={svc.carpetNotes}
                        onChange={e => updateService(svc.key, { carpetNotes: e.target.value })} rows={1}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none" />
                    </div>
                  </>
                )}

                {svc.serviceType === 'custom_service' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Service Name</label>
                      <input value={svc.customName}
                        onChange={e => updateService(svc.key, { customName: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                      <textarea value={svc.customNotes}
                        onChange={e => updateService(svc.key, { customNotes: e.target.value })} rows={1}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Service Notes</label>
                  <input value={svc.notes}
                    onChange={e => updateService(svc.key, { notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Workers</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {staff?.map((s) => {
                const checked = selectedWorkerIds.includes(s.id);
                return (
                  <label key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer ${
                      checked ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleWorker(s.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span>{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Service Date</label>
            <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Job Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Job Confirmation ─────────────────────────────────────

function DeleteJobConfirmModal({
  card,
  onClose,
}: {
  card: ServiceCardWithDetails;
  onClose: () => void;
}) {
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Delete Job</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-2">
          Are you sure you want to delete the job for <strong>{card.customers?.name}</strong>?
        </p>
        <p className="text-xs text-slate-400 mb-4">
          This action cannot be undone. Inventory transactions linked to this job will also be removed.
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleDelete}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function NextBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
    >
      Next <ChevronRight size={14} />
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-slate-500 hover:text-slate-700 text-sm font-medium px-4 py-2"
    >
      ← Back
    </button>
  );
}
