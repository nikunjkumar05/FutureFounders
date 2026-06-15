import { useState } from 'react';
import {
  Search,
  Plus,
  Phone,
  MapPin,
  Bell,
  Check,
  X,
  Users,
  Edit2,
  Trash2,
  ClipboardList,
  FileText,
  ChevronRight,
} from 'lucide-react';
import {
  useCustomers,
  useServiceCards,
  useMarkReminderSent,
  useAddCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '../lib/queries';
import { TableSkeleton } from '../components/LoadingSkeleton';
import type { Customer, ServiceCardWithDetails, ServiceType, ServiceGroup } from '../lib/types';
import { SERVICE_TYPE_LABELS, getServicesFromDetails } from '../lib/types';

export default function Customers() {
  const { data: customers, isLoading } = useCustomers();
  const { data: serviceCards } = useServiceCards();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const filtered = customers?.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your customer base and view service history
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : !filtered?.length ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Service</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Jobs</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((customer) => {
                  const cards = serviceCards?.filter(
                    (sc) => sc.customer_id === customer.id
                  ) ?? [];
                  const latestCard = cards[0] ?? null;
                  const totalJobs = cards.length;
                  const activeJobs = cards.filter(
                    (c) => c.job_status === 'pending' || c.job_status === 'in_progress'
                  ).length;
                  return (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      latestCard={latestCard}
                      totalJobs={totalJobs}
                      activeJobs={activeJobs}
                      onEdit={() => setEditingCustomer(customer)}
                      onDelete={() => setDeletingCustomer(customer)}
                      onViewHistory={() => setHistoryCustomer(customer)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddCustomerModal onClose={() => setShowAddModal(false)} />
      )}
      {editingCustomer && (
        <EditCustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
        />
      )}
      {deletingCustomer && (
        <DeleteConfirmModal
          customer={deletingCustomer}
          onClose={() => setDeletingCustomer(null)}
        />
      )}
      {historyCustomer && (
        <ServiceHistoryModal
          customer={historyCustomer}
          cards={serviceCards?.filter((sc) => sc.customer_id === historyCustomer.id) ?? []}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  latestCard,
  totalJobs,
  activeJobs,
  onEdit,
  onDelete,
  onViewHistory,
}: {
  customer: Customer;
  latestCard: ServiceCardWithDetails | null;
  totalJobs: number;
  activeJobs: number;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
}) {
  const markReminder = useMarkReminderSent();
  const reminderSent = !!latestCard?.reminder_sent_at;

  const handleSendReminder = () => {
    if (!latestCard || reminderSent) return;
    const type = latestCard.service_type as ServiceType;
    const messages: Record<string, string> = {
      standard_cleaning: `Hi ${customer.name}! It's been 6 months since your water tank cleaning with us. Dirty tanks breed bacteria — your family's health matters! Book your cleaning today. Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      deep_cleaning: `Hi ${customer.name}! It's time for your deep cleaning service. Our intensive cleaning removes all buildup and bacteria. Book now! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      sofa_cleaning: `Hi ${customer.name}! It's time for your sofa cleaning service. Keep your furniture fresh and hygienic! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      seats_cleaning: `Hi ${customer.name}! It's time for your seats cleaning service. Enjoy a fresh and clean ride! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      carpet_cleaning: `Hi ${customer.name}! It's time for your carpet cleaning service. Keep your carpets fresh and hygienic! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      custom_service: `Hi ${customer.name}! It's time for your service with AquaClean Services. Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
    };
    const template = messages[type] ?? messages.standard_cleaning;
    window.open(
      `https://wa.me/91${customer.phone}?text=${encodeURIComponent(template)}`
    );
    markReminder.mutate({ cardId: latestCard.id });
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
            {customer.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-slate-900">{customer.name}</p>
            {customer.notes && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <FileText size={10} />
                {customer.notes.length > 40 ? customer.notes.slice(0, 40) + '...' : customer.notes}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-600 flex items-center gap-1 text-xs">
          <Phone size={12} />
          {customer.phone}
        </span>
      </td>
      <td className="px-4 py-3">
        {customer.address ? (
          <span className="text-slate-500 text-xs flex items-center gap-1">
            <MapPin size={12} />
            {customer.address.length > 30 ? customer.address.slice(0, 30) + '...' : customer.address}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {latestCard ? (
          <div>
            <span className="text-slate-600 text-xs font-medium">
              {SERVICE_TYPE_LABELS[latestCard.service_type as ServiceType] ?? latestCard.service_type}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {new Date(latestCard.service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {latestCard?.next_service_date ? (
          <span className="text-xs text-slate-600">
            {new Date(latestCard.next_service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
            {totalJobs}
          </span>
          {activeJobs > 0 && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {activeJobs} active
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={onViewHistory}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="View service history"
          >
            <ClipboardList size={12} />
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={handleSendReminder}
            disabled={reminderSent || !latestCard}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              reminderSent
                ? 'bg-green-100 text-green-700 cursor-default'
                : latestCard
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {reminderSent ? (
              <><Check size={12} /> Sent</>
            ) : (
              <><Bell size={12} /> Remind</>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <Users size={40} className="mx-auto text-slate-300 mb-3" />
      <h3 className="text-lg font-semibold text-slate-700 mb-1">
        No customers yet
      </h3>
      <p className="text-sm text-slate-500">
        Add your first customer to get started.
      </p>
    </div>
  );
}

function ServiceHistoryModal({
  customer,
  cards,
  onClose,
}: {
  customer: Customer;
  cards: ServiceCardWithDetails[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{customer.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {customer.phone}{customer.address ? ` · ${customer.address}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(80vh-120px)]">
          {customer.notes && (
            <div className="mb-4 bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700">{customer.notes}</p>
            </div>
          )}

          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <ClipboardList size={16} className="text-blue-600" />
            Service History
            <span className="text-xs font-normal text-slate-400">({cards.length} total)</span>
          </h3>

          {cards.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No service history yet</p>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => {
                const details = card.service_details as Record<string, unknown>;
                const services = getServicesFromDetails(details);
                const statusColor = card.job_status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : card.job_status === 'in_progress'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700';
                const statusLabel = card.job_status === 'completed'
                  ? 'Completed'
                  : card.job_status === 'in_progress'
                  ? 'In Progress'
                  : 'Pending';
                return (
                  <div key={card.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-900 text-sm">
                          {SERVICE_TYPE_LABELS[card.service_type as ServiceType] ?? card.service_type}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(card.service_date + 'T00:00:00').toLocaleDateString('en-IN', {
                            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {services.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {services.flatMap((group: ServiceGroup) =>
                          group.items.map((item) => {
                            const parts: string[] = [];
                            if (item.capacity) parts.push(`${item.capacity}L`);
                            if (item.sofaType) parts.push(item.sofaType);
                            if (item.carpetArea) parts.push(`${item.carpetArea} sq ft`);
                            if (item.serviceName) parts.push(item.serviceName);
                            if (item.quantity && item.quantity > 1) parts.push(`x${item.quantity}`);
                            return (
                              <div key={item.id} className="text-xs text-slate-500 flex items-center gap-1">
                                <ChevronRight size={10} className="text-slate-300" />
                                {parts.length > 0 ? parts.join(' · ') : `1 service`}
                                {item.price > 0 && <span className="text-slate-400">· ₹{item.price}</span>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                      {card.staff && <span>Worker: {card.staff.name}</span>}
                      {card.next_service_date && (
                        <span>Next: {new Date(card.next_service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditCustomerModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [address, setAddress] = useState(customer.address ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const updateCustomer = useUpdateCustomer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setError('');
    setSubmitting(true);

    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Edit Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes / Landmark</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Nearby landmark, directions, special instructions..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
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

function DeleteConfirmModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const deleteCustomer = useDeleteCustomer();

  const handleDelete = async () => {
    setError('');
    try {
      await deleteCustomer.mutateAsync({ id: customer.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Delete Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-2">
          Are you sure you want to delete <strong>{customer.name}</strong>?
        </p>
        <p className="text-xs text-slate-400 mb-4">
          This action cannot be undone. Their service history will also be removed.
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

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const addCustomer = useAddCustomer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setError('');
    setSubmitting(true);

    try {
      await addCustomer.mutateAsync({
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Add Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes / Landmark</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Nearby landmark, directions, special instructions..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
          )}
          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
            {submitting ? 'Adding...' : 'Add Customer'}
          </button>
        </form>
      </div>
    </div>
  );
}
