import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useServiceCards, useUpdateJobStatus, useCreateJob, useStaff, useCustomers, useSendFeedback } from '../lib/queries';
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
                    <JobCard key={card.id} card={card} />
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
    </div>
  );
}

// ─── Job Card ───────────────────────────────────────────────────

function ServiceDetailsDisplay({ card }: { card: ServiceCardWithDetails }) {
  const details = card.service_details as Record<string, unknown>;

  switch (card.service_type) {
    case 'standard_cleaning': {
      const d = details as unknown as TankCleaningDetails;
      return (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>{d.tankCount} Tank{d.tankCount !== 1 ? 's' : ''}</p>
          <p>{d.tankCapacity}L Each</p>
          <p className="font-medium text-slate-700">Total: {d.totalCapacity}L</p>
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

function JobCard({ card }: { card: ServiceCardWithDetails }) {
  const updateStatus = useUpdateJobStatus();
  const sendFeedback = useSendFeedback();

  const handleComplete = () => {
    if (card.job_status === 'in_progress') {
      updateStatus.mutate({ id: card.id, status: 'completed' });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {card.customers?.name}
          </h3>
          <p className="text-[10px] font-medium text-blue-600 mt-0.5">
            {SERVICE_TYPE_LABELS[card.service_type as ServiceType] ?? card.service_type}
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

      <ServiceDetailsDisplay card={card} />

      <div className="space-y-1 mt-2 mb-3">
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Calendar size={10} />
          {format(new Date(card.service_date), 'dd MMM yyyy')}
        </p>
        {card.staff && (
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <User size={10} />
            {card.staff.name}
          </p>
        )}
        {card.notes && (
          <p className="text-xs text-slate-400 italic flex items-center gap-1">
            <FileText size={10} />
            {card.notes}
          </p>
        )}
      </div>

      {card.job_status === 'in_progress' && (
        <button
          onClick={handleComplete}
          disabled={updateStatus.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          Mark Complete
          <ChevronRight size={12} />
        </button>
      )}

      {card.job_status === 'pending' && (
        <button
          onClick={() => updateStatus.mutate({ id: card.id, status: 'in_progress' })}
          disabled={updateStatus.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          Start Job
          <ChevronRight size={12} />
        </button>
      )}

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

// ─── Create Job Modal ────────────────────────────────────────────

const serviceOptions: { value: ServiceType; label: string }[] = [
  { value: 'standard_cleaning', label: 'Water Tank Cleaning' },
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

  // Step 2: Service type
  const [serviceType, setServiceType] = useState<ServiceType>('standard_cleaning');

  // Step 3: Dynamic fields
  const [tankCount, setTankCount] = useState('1');
  const [tankCapacity, setTankCapacity] = useState('1000');
  const [sofaCount, setSofaCount] = useState('1');
  const [sofaType, setSofaType] = useState('Standard');
  const [seatCount, setSeatCount] = useState('1');
  const [carpetArea, setCarpetArea] = useState('100');
  const [carpetNotes, setCarpetNotes] = useState('');
  const [customName, setCustomName] = useState('');
  const [customNotes, setCustomNotes] = useState('');

  // Step 4: Worker
  const [technicianId, setTechnicianId] = useState('');

  // Step 5: Schedule
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobNotes, setJobNotes] = useState('');

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  const getServiceDetails = (): ServiceDetails => {
    switch (serviceType) {
      case 'standard_cleaning': {
        const tCount = parseInt(tankCount) || 1;
        const tCap = parseInt(tankCapacity) || 1000;
        return { tankCount: tCount, tankCapacity: tCap, totalCapacity: tCount * tCap };
      }
      case 'sofa_cleaning':
        return { sofaCount: parseInt(sofaCount) || 1, sofaType };
      case 'seats_cleaning':
        return { seatCount: parseInt(seatCount) || 1 };
      case 'carpet_cleaning':
        return { carpetArea: parseInt(carpetArea) || 100, notes: carpetNotes || undefined };
      case 'custom_service':
        return { serviceName: customName, notes: customNotes || undefined };
    }
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

      await createJob.mutateAsync({
        customerId,
        serviceType,
        serviceDetails: getServiceDetails(),
        serviceDate,
        technicianId: technicianId || undefined,
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
              <NextBtn disabled={!selectedCustomerId && !(showNewCustomer && newCustomerName && newCustomerPhone)} onClick={() => setStep('select_service')} />
            </div>
          </div>
        );

      case 'select_service':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Select Service Type</h3>
            <div className="grid grid-cols-1 gap-2">
              {serviceOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setServiceType(opt.value); setStep('service_details'); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors border ${
                    serviceType === opt.value
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('select_customer')} />
            </div>
          </div>
        );

      case 'service_details':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {SERVICE_TYPE_LABELS[serviceType]} Details
            </h3>

            {serviceType === 'standard_cleaning' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tank Count</label>
                  <input type="number" value={tankCount} onChange={e => setTankCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tank Capacity (Liters)</label>
                  <input type="number" value={tankCapacity} onChange={e => setTankCapacity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-slate-500">Total Capacity: </span>
                  <span className="font-semibold text-slate-900">
                    {(parseInt(tankCount) || 1) * (parseInt(tankCapacity) || 1000)}L
                  </span>
                </div>
              </>
            )}

            {serviceType === 'sofa_cleaning' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Sofa Count</label>
                  <input type="number" value={sofaCount} onChange={e => setSofaCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Sofa Type</label>
                  <select value={sofaType} onChange={e => setSofaType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="Standard">Standard</option>
                    <option value="L-Shape">L-Shape</option>
                    <option value="Sectional">Sectional</option>
                    <option value="Recliner">Recliner</option>
                  </select>
                </div>
              </>
            )}

            {serviceType === 'seats_cleaning' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Seat Count</label>
                <input type="number" value={seatCount} onChange={e => setSeatCount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {serviceType === 'carpet_cleaning' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Carpet Area (sq ft)</label>
                  <input type="number" value={carpetArea} onChange={e => setCarpetArea(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <textarea value={carpetNotes} onChange={e => setCarpetNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </>
            )}

            {serviceType === 'custom_service' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Service Name *</label>
                  <input value={customName} onChange={e => setCustomName(e.target.value)}
                    placeholder="e.g. Deep Cleaning"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <textarea value={customNotes} onChange={e => setCustomNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </>
            )}

            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('select_service')} />
              <NextBtn onClick={() => setStep('assign_worker')} />
            </div>
          </div>
        );

      case 'assign_worker':
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Assign Worker</h3>
            <div className="space-y-1">
              <button
                onClick={() => setTechnicianId('')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  !technicianId ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className="font-medium">Unassigned</span>
              </button>
              {staff?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setTechnicianId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    technicianId === s.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate-400 ml-2">₹{s.daily_wage_inr}/day</span>
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
            <h3 className="text-sm font-semibold text-slate-900">Schedule</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Service Date</label>
              <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea value={jobNotes} onChange={e => setJobNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optional job notes" />
            </div>
            <div className="flex justify-between pt-2">
              <BackBtn onClick={() => setStep('assign_worker')} />
              <NextBtn onClick={() => setStep('review')} />
            </div>
          </div>
        );

      case 'review':
        const customerName = showNewCustomer ? newCustomerName : selectedCustomer?.name;
        const workerName = staff?.find(s => s.id === technicianId)?.name ?? 'Unassigned';
        const details = getServiceDetails();
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Review & Create</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-medium">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Service</span>
                <span className="font-medium">{SERVICE_TYPE_LABELS[serviceType]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Details</span>
                <span className="font-medium text-xs">
                  {serviceType === 'standard_cleaning' && `${(details as TankCleaningDetails).totalCapacity}L`}
                  {serviceType === 'sofa_cleaning' && `${(details as SofaCleaningDetails).sofaCount} sofa(s)`}
                  {serviceType === 'seats_cleaning' && `${(details as SeatsCleaningDetails).seatCount} seat(s)`}
                  {serviceType === 'carpet_cleaning' && `${(details as CarpetCleaningDetails).carpetArea} sq ft`}
                  {serviceType === 'custom_service' && (details as CustomServiceDetails).serviceName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Worker</span>
                <span className="font-medium">{workerName}</span>
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
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Job</h2>
            <p className="text-xs text-slate-400">
              Step {['select_customer', 'select_service', 'service_details', 'assign_worker', 'schedule', 'review'].indexOf(step) + 1} of 6
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
