import { useState, useMemo } from 'react';
import {
  useAmcContracts,
  useCustomers,
  useCreateAmcContract,
  useUpdateAmcContract,
  usePauseAmcContract,
  useResumeAmcContract,
  useCancelAmcContract,
  useDeleteAmcContract,
} from '../lib/queries';
import { format } from 'date-fns';
import {
  Plus,
  X,
  Search,
  Eye,
  Edit2,
  Trash2,
  PauseCircle,
  PlayCircle,
  Ban,
  FileText,
} from 'lucide-react';
import type { AmcContractWithDetails, AmcContractStatus, AmcFrequency, ServiceType, ServiceGroup, ServiceItem } from '../lib/types';
import { SERVICE_TYPE_LABELS, generateItemId } from '../lib/types';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { validateContractDates } from '../lib/amc-contract-service';
import { isValidFrequency } from '../lib/amc-utils';

const STATUS_CONFIG: Record<AmcContractStatus, { label: string; badge: string; color: string }> = {
  active: { label: 'Active', badge: 'badge-ok', color: 'text-navy-600 dark:text-navy-400' },
  paused: { label: 'Paused', badge: 'badge-warn', color: 'text-amber-600 dark:text-amber-400' },
  cancelled: { label: 'Cancelled', badge: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400', color: 'text-surface-500 dark:text-surface-400' },
  completed: { label: 'Completed', badge: 'badge-info', color: 'text-cyan-600 dark:text-cyan-400' },
};

const FREQUENCY_LABELS: Record<AmcFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannual: 'Biannual',
  annual: 'Annual',
};

const serviceOptions: { value: ServiceType; label: string }[] = [
  { value: 'standard_cleaning', label: 'Water Tank Cleaning' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'sofa_cleaning', label: 'Sofa Cleaning' },
  { value: 'seats_cleaning', label: 'Seats Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'custom_service', label: 'Custom Service' },
];

const statusTabs: { status: AmcContractStatus | 'all'; label: string }[] = [
  { status: 'all', label: 'All' },
  { status: 'active', label: 'Active' },
  { status: 'paused', label: 'Paused' },
  { status: 'cancelled', label: 'Cancelled' },
];

function isActiveStatus(status: AmcContractStatus): boolean {
  return status === 'active';
}

export default function AmcContracts() {
  const { data: contracts, isLoading } = useAmcContracts();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContract, setEditingContract] = useState<AmcContractWithDetails | null>(null);
  const [deletingContract, setDeletingContract] = useState<AmcContractWithDetails | null>(null);
  const [viewingContract, setViewingContract] = useState<AmcContractWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AmcContractStatus | 'all'>('all');

  const filteredContracts = useMemo(() => {
    if (!contracts) return [];
    let list = contracts;
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        list = list.filter(c => isActiveStatus(c.status));
      } else {
        list = list.filter(c => c.status === statusFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => {
        const name = c.customers?.name?.toLowerCase() ?? '';
        const phone = c.customers?.phone ?? '';
        return name.includes(q) || phone.includes(q);
      });
    }
    return list;
  }, [contracts, searchQuery, statusFilter]);

  const statusCount = (status: AmcContractStatus): number => {
    if (!contracts) return 0;
    if (isActiveStatus(status)) return contracts.filter(c => isActiveStatus(c.status)).length;
    return contracts.filter(c => c.status === status).length;
  };

  if (isLoading) return <TableSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100">AMC Contracts</h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            Manage annual maintenance contracts for recurring customers
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus size={16} /> New Contract
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500" />
        <input
          type="search"
          placeholder="Search by customer name or phone number"
          aria-label="Search contracts by customer name or phone number"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-base pl-9"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {statusTabs.map(({ status, label }) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-navy-600 text-white'
                : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
            }`}
          >
            {label}
            {status !== 'all' && (
              <span className="ml-1.5 opacity-75">({statusCount(status as AmcContractStatus)})</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredContracts.length === 0 ? (
          <div className="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-2xl p-12 text-center">
            <FileText size={32} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
            <p className="text-body-sm text-surface-400 dark:text-surface-500">
              {searchQuery ? 'No contracts match your search' : 'No AMC contracts yet'}
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-3">
              <Plus size={16} /> Create your first contract
            </button>
          </div>
        ) : (
          filteredContracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              onView={() => setViewingContract(contract)}
              onEdit={() => setEditingContract(contract)}
              onDelete={() => setDeletingContract(contract)}
            />
          ))
        )}
      </div>

      {showCreateModal && <CreateContractModal onClose={() => setShowCreateModal(false)} />}
      {editingContract && <EditContractModal contract={editingContract} onClose={() => setEditingContract(null)} />}
      {deletingContract && <DeleteContractConfirmModal contract={deletingContract} onClose={() => setDeletingContract(null)} />}
      {viewingContract && <ContractDetailModal contract={viewingContract} onClose={() => setViewingContract(null)} />}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function getServiceTemplate(contract: AmcContractWithDetails): ServiceGroup[] {
  const t = contract.service_template as Record<string, unknown>;
  if (t && Array.isArray(t.services)) return t.services as ServiceGroup[];
  return [];
}

function formatItemDetail(item: ServiceItem, serviceType: ServiceType): string {
  switch (serviceType) {
    case 'standard_cleaning':
    case 'deep_cleaning':
      return `${item.capacity ?? 0}L Tank`;
    case 'sofa_cleaning':
      return item.sofaType ? `${item.sofaType} Sofa` : 'Standard Sofa';
    case 'seats_cleaning':
      return 'Seat';
    case 'carpet_cleaning':
      return `${item.carpetArea ?? 0} sq ft`;
    case 'custom_service':
      return item.serviceName ?? 'Custom';
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

function createDefaultItem(st: ServiceType): ServiceItem {
  const base: ServiceItem = { id: generateItemId(), quantity: 0, price: 0 };
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

// ─── Contract Card ───────────────────────────────────────────────

function ContractCard({ contract, onView, onEdit, onDelete }: {
  contract: AmcContractWithDetails; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const pauseContract = usePauseAmcContract();
  const resumeContract = useResumeAmcContract();
  const cancelContract = useCancelAmcContract();
  const config = STATUS_CONFIG[contract.status];
  const freqLabel = FREQUENCY_LABELS[contract.frequency];
  const services = getServiceTemplate(contract);

  const handlePause = () => pauseContract.mutate({ id: contract.id, currentStatus: contract.status });
  const handleResume = () => resumeContract.mutate({ id: contract.id, currentStatus: contract.status });
  const handleCancel = () => cancelContract.mutate({ id: contract.id, currentStatus: contract.status });

  return (
    <div className="card-base p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-surface-900 dark:text-surface-100 text-sm truncate">
            {contract.customers?.name}
          </h3>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {freqLabel} · {format(new Date(contract.start_date), 'dd MMM yyyy')} – {format(new Date(contract.end_date), 'dd MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onView} className="btn-ghost p-1.5" title="View details"><Eye size={14} /></button>
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="btn-ghost p-1.5 text-surface-400 hover:text-amber-600" title="Delete"><Trash2 size={14} /></button>
          <span className={`ml-1 ${config.badge}`}>{config.label}</span>
        </div>
      </div>

      {services.length > 0 && (
        <div className="text-xs text-surface-600 dark:text-surface-400 mb-2 space-y-0.5">
          {services.map((svc, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="truncate">{SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}: {getServiceSummary(svc)}</span>
              {svc.totalPrice > 0 && <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium whitespace-nowrap ml-2">₹{svc.totalPrice.toLocaleString('en-IN')}</span>}
            </div>
          ))}
        </div>
      )}

      {contract.notes && (
        <p className="text-xs text-surface-500 dark:text-surface-400 mb-3 italic line-clamp-1">{contract.notes}</p>
      )}

      <div className="flex gap-2">
        {contract.status === 'active' && (
          <>
            <button onClick={handlePause} disabled={pauseContract.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-display font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 py-2 rounded-xl transition-colors disabled:opacity-50">
              <PauseCircle size={12} /> Pause
            </button>
            <button onClick={handleCancel} disabled={cancelContract.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-display font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 py-2 rounded-xl transition-colors disabled:opacity-50">
              <Ban size={12} /> Cancel
            </button>
          </>
        )}
        {contract.status === 'paused' && (
          <>
            <button onClick={handleResume} disabled={resumeContract.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-display font-medium text-navy-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 py-2 rounded-xl transition-colors disabled:opacity-50">
              <PlayCircle size={12} /> Resume
            </button>
            <button onClick={handleCancel} disabled={cancelContract.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-display font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 py-2 rounded-xl transition-colors disabled:opacity-50">
              <Ban size={12} /> Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Contract Detail Modal ───────────────────────────────────────

function ContractDetailModal({ contract, onClose }: { contract: AmcContractWithDetails; onClose: () => void }) {
  const config = STATUS_CONFIG[contract.status];
  const freqLabel = FREQUENCY_LABELS[contract.frequency];
  const services = getServiceTemplate(contract);

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Contract details</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">Created {format(new Date(contract.created_at), 'dd MMM yyyy, h:mm a')}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
            <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Customer</h3>
            <p className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{contract.customers?.name}</p>
            <p className="text-body-xs text-surface-500 dark:text-surface-400">{contract.customers?.phone}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Status</h3>
              <span className={config.badge}>{config.label}</span>
            </div>
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Frequency</h3>
              <p className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">{freqLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Start date</h3>
              <p className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">{format(new Date(contract.start_date), 'dd MMM yyyy')}</p>
            </div>
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">End date</h3>
              <p className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">{format(new Date(contract.end_date), 'dd MMM yyyy')}</p>
            </div>
          </div>

          {services.length > 0 && (
            <div>
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-3">Covered services ({services.length})</h3>
              <div className="space-y-3">
                {services.map((svc, idx) => (
                  <div key={idx} className="border border-surface-200 dark:border-surface-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}</p>
                      {svc.totalPrice > 0 && <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">₹{svc.totalPrice.toLocaleString('en-IN')}</span>}
                    </div>
                    <div className="space-y-1">
                      {svc.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-center justify-between text-sm text-surface-700 dark:text-surface-200 bg-surface-50 dark:bg-surface-800/50 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-cyan-600 dark:text-cyan-400">{formatItemDetail(item, svc.serviceType)}</span>
                            <span className="ml-2">
                              <span className="text-surface-900 dark:text-surface-100 font-semibold">Qty: {item.quantity}</span>
                              {item.price > 0 && (
                                <span className="text-surface-400 dark:text-surface-500"> · ₹{item.price.toLocaleString('en-IN')}/unit</span>
                              )}
                            </span>
                          </div>
                          {item.price > 0 && <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium ml-2">₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contract.notes && (
            <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
              <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Notes</h3>
              <p className="text-body-sm text-surface-700 dark:text-surface-200">{contract.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Service Template Editor ─────────────────────────────────────

const predefinedCaps = [500, 1000, 1500, 2000, 3000, 5000, 10000];
const PREDEFINED_SOFA_TYPES = ['Standard', 'Chair', 'Sectional', 'Dining Chair', 'Puffy'];

function ServiceTemplateEditor({ groups, onChange }: {
  groups: ServiceGroup[];
  onChange: (groups: ServiceGroup[]) => void;
}) {
  const [showAddService, setShowAddService] = useState(false);
  const selectedTypes = groups.map(g => g.serviceType);
  const availableTypes = serviceOptions.filter(opt => !selectedTypes.includes(opt.value));

  const addServiceGroup = (st: ServiceType) => {
    onChange([...groups, { serviceType: st, items: [createDefaultItem(st)], totalPrice: 0 }]);
    setShowAddService(false);
  };

  const removeServiceGroup = (idx: number) => {
    onChange(groups.filter((_, i) => i !== idx));
  };

  const addItem = (groupIdx: number) => {
    onChange(groups.map((g, i) => {
      if (i !== groupIdx) return g;
      return { ...g, items: [...g.items, createDefaultItem(g.serviceType)] };
    }));
  };

  const removeItem = (groupIdx: number, itemIdx: number) => {
    onChange(groups.map((g, i) => {
      if (i !== groupIdx) return g;
      if (g.items.length <= 1) return g;
      return { ...g, items: g.items.filter((_, j) => j !== itemIdx) };
    }));
  };

  const updateItem = (groupIdx: number, itemIdx: number, updates: Partial<ServiceItem>) => {
    onChange(groups.map((g, i) => {
      if (i !== groupIdx) return g;
      const newItems = g.items.map((item, j) => (j === itemIdx ? { ...item, ...updates } : item));
      const totalPrice = newItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      return { ...g, items: newItems, totalPrice };
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
          Covered services ({groups.length})
        </h3>
        {availableTypes.length > 0 && (
          <button type="button" onClick={() => setShowAddService(!showAddService)}
            className="text-xs font-medium text-navy-600 dark:text-navy-400 hover:text-navy-700 flex items-center gap-1">
            <Plus size={12} /> Add Service
          </button>
        )}
      </div>

      {showAddService && (
        <div className="p-3 border border-navy-200 dark:border-navy-700 bg-navy-50 dark:bg-navy-900/50 rounded-xl">
          <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-2">Select service type:</p>
          <div className="space-y-1">
            {availableTypes.map(opt => (
              <button key={opt.value} type="button" onClick={() => addServiceGroup(opt.value)}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-navy-100 dark:hover:bg-navy-800 transition-colors text-surface-700 dark:text-surface-200">
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 && !showAddService && (
        <div className="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-xl p-6 text-center">
          <p className="text-xs text-surface-400 dark:text-surface-500">No services added yet</p>
        </div>
      )}

      {groups.map((group, groupIdx) => (
        <div key={groupIdx} className="border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-surface-50 dark:bg-surface-800/50 px-3 py-2">
            <span className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">
              {SERVICE_TYPE_LABELS[group.serviceType] ?? group.serviceType}
            </span>
            <div className="flex items-center gap-2">
              {group.totalPrice > 0 && (
                <span className="text-xs font-mono font-medium text-cyan-600 dark:text-cyan-400">₹{group.totalPrice.toLocaleString('en-IN')}</span>
              )}
              <button type="button" onClick={() => removeServiceGroup(groupIdx)}
                className="text-surface-400 hover:text-red-500 transition-colors p-0.5"><Trash2 size={12} /></button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {group.items.map((item, itemIdx) => (
              <div key={item.id} className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 uppercase">Item {itemIdx + 1}</span>
                  {group.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(groupIdx, itemIdx)}
                      className="text-red-400 hover:text-red-600 transition-colors"><X size={12} /></button>
                  )}
                </div>

                {(group.serviceType === 'standard_cleaning' || group.serviceType === 'deep_cleaning') && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Capacity</label>
                      <select value={item.capacityMode === 'custom' ? -1 : (item.capacity ?? 1000)} onChange={e => {
                        const v = parseInt(e.target.value);
                        if (v === -1) updateItem(groupIdx, itemIdx, { capacity: -1, capacityMode: 'custom' });
                        else updateItem(groupIdx, itemIdx, { capacity: v, capacityMode: 'predefined' });
                      }} className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white">
                        {predefinedCaps.map(c => <option key={c} value={c}>{c}L</option>)}
                        <option disabled>──────────</option>
                        <option value={-1}>Custom...</option>
                      </select>
                      {item.capacityMode === 'custom' && (
                        <input type="number" min={1} value={item.capacity === -1 ? '' : item.capacity}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '') updateItem(groupIdx, itemIdx, { capacity: -1 });
                            else { const num = parseInt(v); if (!isNaN(num) && num >= 1) updateItem(groupIdx, itemIdx, { capacity: num }); }
                          }}
                          className="mt-1 w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                      <input type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                      <input type="number" min={0} value={item.price || ''} onChange={e => updateItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                        placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  </div>
                )}

                {group.serviceType === 'sofa_cleaning' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Type</label>
                      <select value={item.sofaType && PREDEFINED_SOFA_TYPES.includes(item.sofaType) ? item.sofaType : '__custom__'} onChange={e => {
                        const val = e.target.value;
                        updateItem(groupIdx, itemIdx, { sofaType: val === '__custom__' ? '' : val });
                      }} className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white">
                        {PREDEFINED_SOFA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="__custom__">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                      <input type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                      <input type="number" min={0} value={item.price || ''} onChange={e => updateItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                        placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  </div>
                )}

                {group.serviceType === 'sofa_cleaning' && item.sofaType !== undefined && !PREDEFINED_SOFA_TYPES.includes(item.sofaType) && (
                  <div>
                    <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Custom name</label>
                    <input type="text" value={item.sofaType} onChange={e => updateItem(groupIdx, itemIdx, { sofaType: e.target.value })}
                      placeholder="e.g. Office Chair"
                      className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                  </div>
                )}

                {group.serviceType === 'seats_cleaning' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                      <input type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                      <input type="number" min={0} value={item.price || ''} onChange={e => updateItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                        placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  </div>
                )}

                {group.serviceType === 'carpet_cleaning' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Area</label>
                      <input type="number" min={1} value={item.carpetArea ?? 100} onChange={e => updateItem(groupIdx, itemIdx, { carpetArea: parseInt(e.target.value) || 100 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                      <input type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                      <input type="number" min={0} value={item.price || ''} onChange={e => updateItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                        placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  </div>
                )}

                {group.serviceType === 'custom_service' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Name</label>
                      <input value={item.serviceName ?? ''} onChange={e => updateItem(groupIdx, itemIdx, { serviceName: e.target.value })}
                        placeholder="e.g. Window" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Qty</label>
                      <input type="number" min={1} value={item.quantity || ''} onChange={e => updateItem(groupIdx, itemIdx, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Price</label>
                      <input type="number" min={0} value={item.price || ''} onChange={e => updateItem(groupIdx, itemIdx, { price: parseInt(e.target.value) || 0 })}
                        placeholder="0" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Notes</label>
                  <input value={item.notes ?? ''} onChange={e => updateItem(groupIdx, itemIdx, { notes: e.target.value })}
                    placeholder="Item notes" className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs bg-white dark:bg-surface-700 dark:text-white" />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => addItem(groupIdx)}
              className="w-full flex items-center justify-center gap-1 text-xs font-medium text-navy-600 dark:text-navy-400 hover:text-navy-700 py-1.5 rounded-lg border border-dashed border-surface-300 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <Plus size={12} /> Add Item
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create Contract Modal ───────────────────────────────────────

function CreateContractModal({ onClose }: { onClose: () => void }) {
  const { data: customers } = useCustomers();
  const createContract = useCreateAmcContract();

  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [frequency, setFrequency] = useState<AmcFrequency>('quarterly');
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const validationErrors = validateContractDates(startDate, endDate);
    if (!customerId) {
      validationErrors.push('customer_id is required');
    }
    if (!isValidFrequency(frequency)) {
      validationErrors.push(`invalid frequency: "${frequency}" — must be one of: monthly, quarterly, biannual, annual`);
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await createContract.mutateAsync({
        customerId,
        startDate,
        endDate,
        frequency,
        serviceTemplate: serviceGroups.length > 0
          ? { services: serviceGroups, totalCharge: serviceGroups.reduce((s, g) => s + g.totalPrice, 0) }
          : undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to create contract']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">New AMC Contract</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">Set up recurring maintenance for a customer</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Customer *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input-base" required>
              <option value="">Select customer</option>
              {customers?.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Start date *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-base" required />
            </div>
            <div>
              <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">End date *</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-base" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Frequency *</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as AmcFrequency)} className="input-base">
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <ServiceTemplateEditor groups={serviceGroups} onChange={setServiceGroups} />

          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-base resize-none" placeholder="Optional notes about this contract" />
          </div>

          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{err}</p>
              ))}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating...' : 'Create Contract'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Contract Modal ─────────────────────────────────────────

function EditContractModal({ contract, onClose }: { contract: AmcContractWithDetails; onClose: () => void }) {
  const updateContract = useUpdateAmcContract();
  const existingServices = getServiceTemplate(contract);

  const [startDate, setStartDate] = useState(contract.start_date);
  const [endDate, setEndDate] = useState(contract.end_date);
  const [frequency, setFrequency] = useState<AmcFrequency>(contract.frequency);
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>(existingServices);
  const [notes, setNotes] = useState(contract.notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const dateErrors = validateContractDates(startDate, endDate);
    if (!isValidFrequency(frequency)) {
      dateErrors.push(`invalid frequency: "${frequency}" — must be one of: monthly, quarterly, biannual, annual`);
    }
    if (dateErrors.length > 0) {
      setErrors(dateErrors);
      return;
    }

    setSubmitting(true);
    try {
      await updateContract.mutateAsync({
        id: contract.id,
        startDate,
        endDate,
        frequency,
        serviceTemplate: serviceGroups.length > 0
          ? { services: serviceGroups, totalCharge: serviceGroups.reduce((s, g) => s + g.totalPrice, 0) }
          : {},
        notes: notes ?? null,
      });
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to update contract']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Edit contract</h2>
            <p className="text-body-xs text-surface-500 dark:text-surface-400 mt-0.5">{contract.customers?.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Start date *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-base" required />
            </div>
            <div>
              <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">End date *</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-base" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Frequency *</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as AmcFrequency)} className="input-base">
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <ServiceTemplateEditor groups={serviceGroups} onChange={setServiceGroups} />

          <div>
            <label className="block text-xs font-display font-medium text-surface-600 dark:text-surface-400 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-base resize-none" />
          </div>

          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{err}</p>
              ))}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Contract Confirmation ─────────────────────────────────

function DeleteContractConfirmModal({ contract, onClose }: { contract: AmcContractWithDetails; onClose: () => void }) {
  const deleteContract = useDeleteAmcContract();
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setError('');
    try {
      await deleteContract.mutateAsync({ id: contract.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contract');
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-2xl w-full max-w-sm shadow-xl p-5 border border-surface-200 dark:border-surface-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-display-sm font-display text-surface-900 dark:text-surface-100">Delete contract</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
        <p className="text-body-sm text-surface-600 dark:text-surface-300 mb-2">
          Delete the AMC contract for <strong>{contract.customers?.name}</strong>?
        </p>
        <p className="text-body-xs text-surface-500 dark:text-surface-400 mb-4">
          Service history linked to this contract will be preserved. This action cannot be undone.
        </p>
        {error && <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-xl px-3 py-2 mb-4">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteContract.isPending} className="px-4 py-2.5 rounded-xl text-sm font-display font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50">Delete</button>
        </div>
      </div>
    </div>
  );
}
