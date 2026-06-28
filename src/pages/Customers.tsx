import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  MapPin,
  Bell,
  Check,
  X,
  Users,
  Edit2,
  Trash2,
  ClipboardList,
  FileText,
} from 'lucide-react';
import {
  useCustomers,
  useServiceCards,
  useMarkReminderSent,
  useCreateReminderResponse,
  useAddCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  checkDuplicateCustomer,
} from '../lib/queries';
import { trackEvent } from '../lib/analytics';
import { TableSkeleton } from '../components/LoadingSkeleton';
import ContactPicker from '../components/ContactPicker';
import DuplicateWarningModal from '../components/DuplicateWarningModal';
import TimeFilter from '../components/TimeFilter';
import { type TimePeriod, isInRange, groupByMonthYear } from '../lib/timeUtils';
import type { Customer, DuplicateCheckResult, ServiceCardWithDetails, ServiceType, ServiceGroup } from '../lib/types';
import { SERVICE_TYPE_LABELS, getServicesFromDetails, getTotalCharge } from '../lib/types';
import { PhoneLink } from '../components/PhoneLink';

export default function Customers() {
  const { data: customers, isLoading } = useCustomers();
  const { data: serviceCards } = useServiceCards();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const filtered = customers?.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const filteredByPeriod = useMemo(() => {
    if (period === 'all') return filtered;
    return filtered?.filter(c => isInRange(c.created_at, period));
  }, [filtered, period]);

  const customerGroups = useMemo(() => {
    if (!filteredByPeriod) return new Map<string, Customer[]>();
    return groupByMonthYear(filteredByPeriod, c => c.created_at);
  }, [filteredByPeriod]);

  function buildCustomerRow(customer: Customer) {
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
  }

  const renderedRows = period === 'all' && !search
    ? [...customerGroups.entries()].flatMap(([monthYear, groupCustomers]) => [
        <tr key={monthYear} className="bg-surface-50 dark:bg-surface-800/50">
          <td colSpan={7} className="px-4 py-2 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">
            {monthYear}
          </td>
        </tr>,
        ...groupCustomers.map(buildCustomerRow),
      ])
    : filteredByPeriod?.map(buildCustomerRow) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100">Properties</h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            {search || period !== 'all'
              ? `Showing ${filteredByPeriod?.length ?? 0} of ${customers?.length ?? 0} customers`
              : `${customers?.length ?? 0} customers`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          Add property
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500"
          />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9"
          />
        </div>
        <TimeFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : !filteredByPeriod?.length ? (
        <EmptyState />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 dark:border-surface-700 bg-surface-50 dark:bg-surface-700/50">
                  <th className="text-left px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Last service</th>
                  <th className="text-left px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Next service</th>
                  <th className="text-center px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Jobs</th>
                  <th className="text-right px-4 py-3 text-xs font-display font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {renderedRows}
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
  const createReminderResponse = useCreateReminderResponse();
  const reminderSent = !!latestCard?.reminder_sent_at;

  const handleSendReminder = () => {
    if (!latestCard || reminderSent) return;
    const type = latestCard.service_type as ServiceType;
    const messages: Record<string, string> = {
      standard_cleaning: `Namaste ${customer.name}! Aapke paani ki tanki ki safai ka samay aa gaya hai. Gande tank se bimariyan failti hain. Aaj hi safai book karein! Reply YES to confirm or call 9876543210. — AquaClean Services`,
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
    trackEvent('reminder_sent', { customer_id: customer.id, customer_name: customer.name, service_type: latestCard.service_type });
    createReminderResponse.mutate({
      serviceCardId: latestCard.id,
      customerId: customer.id,
      status: 'sent',
    });
  };

  return (
    <tr className="hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs font-display font-bold shrink-0">
            {customer.name.charAt(0)}
          </div>
          <div>
            <p className="font-display font-medium text-surface-900 dark:text-surface-100">{customer.name}</p>
            {customer.notes && (
              <p className="text-xs text-surface-400 dark:text-surface-500 flex items-center gap-1 mt-0.5">
                <FileText size={10} />
                {customer.notes.length > 40 ? customer.notes.slice(0, 40) + '...' : customer.notes}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <PhoneLink phone={customer.phone} />
      </td>
      <td className="px-4 py-3">
        {customer.address ? (
          <span className="text-surface-500 dark:text-surface-400 text-xs flex items-center gap-1">
            <MapPin size={12} />
            {customer.address.length > 30 ? customer.address.slice(0, 30) + '...' : customer.address}
          </span>
        ) : (
          <span className="text-surface-300 dark:text-surface-600 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {latestCard ? (
          <div>
            <span className="text-surface-600 dark:text-surface-300 text-xs font-display font-medium">
              {SERVICE_TYPE_LABELS[latestCard.service_type as ServiceType] ?? latestCard.service_type}
            </span>
            <p className="text-body-xs text-surface-400 dark:text-surface-500 mt-0.5">
              {new Date(latestCard.service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        ) : (
          <span className="text-surface-300 dark:text-surface-600 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {latestCard?.next_service_date ? (
          <span className="font-mono text-xs text-surface-600 dark:text-surface-300">
            {new Date(latestCard.next_service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ) : (
          <span className="text-surface-300 dark:text-surface-600 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="badge-neutral">{totalJobs}</span>
          {activeJobs > 0 && (
            <span className="badge-info">{activeJobs} active</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={onViewHistory}
            className="btn-ghost p-1.5"
            title="View service history"
          >
            <ClipboardList size={12} />
          </button>
          <button
            onClick={onEdit}
            className="btn-ghost p-1.5"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={onDelete}
            className="btn-ghost p-1.5 text-surface-400 hover:text-red-600"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={handleSendReminder}
            disabled={reminderSent || !latestCard}
            className={`inline-flex items-center gap-1.5 text-xs font-display font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              reminderSent
                ? 'badge-ok cursor-default'
                : latestCard
                ? 'btn-primary !py-1.5 !text-xs'
                : 'bg-surface-100 dark:bg-surface-700 text-surface-400 dark:text-surface-500 cursor-not-allowed'
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
    <div className="card-base p-12 text-center">
      <Users size={40} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
      <h3 className="text-display-sm font-display text-surface-700 dark:text-surface-200 mb-1">
        No properties yet
      </h3>
      <p className="text-body-sm text-surface-500 dark:text-surface-400">
        Add your first property to get started.
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
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-lg max-h-[80vh] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-600/50">
          <div>
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">{customer.name}</h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {customer.phone}{customer.address ? ` · ${customer.address}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(80vh-120px)]">
          {customer.notes && (
            <div className="mb-4 bg-surface-50 dark:bg-surface-900/50 rounded-lg p-3">
              <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Notes</p>
              <p className="text-sm text-surface-700 dark:text-surface-200">{customer.notes}</p>
            </div>
          )}

          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 mb-3 flex items-center gap-2">
            <ClipboardList size={16} className="text-navy-600" />
            Service History
            <span className="text-xs font-normal text-surface-400 dark:text-surface-500">({cards.length} total)</span>
          </h3>

          {cards.length === 0 ? (
            <p className="text-sm text-surface-400 dark:text-surface-500 text-center py-8">No service history yet</p>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => {
                const details = card.service_details as Record<string, unknown>;
                const services = getServicesFromDetails(details);
                const statusLabel = card.job_status === 'completed'
                  ? 'Completed'
                  : card.job_status === 'in_progress'
                  ? 'In Progress'
                  : 'Pending';
                return (
                  <div key={card.id} className="border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3 hover:shadow-sm transition-shadow">
                    {/* Status & service date */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
                        <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Status</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          card.job_status === 'completed' ? 'badge-ok'
                            : card.job_status === 'in_progress' ? 'badge-info'
                            : 'badge-warn'
                        }`}>{statusLabel}</span>
                      </div>
                      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
                        <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Service date</h3>
                        <p className="text-sm font-display font-medium text-surface-900 dark:text-surface-100">
                          {new Date(card.service_date + 'T00:00:00').toLocaleDateString('en-IN', {
                            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Services */}
                    <div>
                      <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-3">Services ({services.length})</h3>
                      <div className="space-y-3">
                        {(services.length > 0 ? services : [{ serviceType: card.service_type as ServiceType, items: [], totalPrice: 0 } as ServiceGroup]).map((svc, idx) => (
                          <div key={idx} className="border border-surface-200 dark:border-surface-700 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">{SERVICE_TYPE_LABELS[svc.serviceType as ServiceType] ?? svc.serviceType}</p>
                              {svc.totalPrice > 0 && <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">₹{svc.totalPrice.toLocaleString('en-IN')}</span>}
                            </div>
                            {svc.items.length > 0 ? (
                              <div className="space-y-1">
                                {svc.items.map((item, itemIdx) => (
                                  <div key={item.id ?? itemIdx} className="flex items-center justify-between text-sm text-surface-700 dark:text-surface-200 bg-surface-50 dark:bg-surface-800/50 rounded-lg px-3 py-2">
                                    <div>
                                      <span className="text-surface-700 dark:text-surface-200">
                                        {svc.serviceType === 'standard_cleaning' || svc.serviceType === 'deep_cleaning'
                                          ? `${item.capacity || 0}L Tank`
                                          : svc.serviceType === 'sofa_cleaning'
                                          ? `${item.sofaType || 'Standard'} Sofa`
                                          : svc.serviceType === 'seats_cleaning'
                                          ? 'Seat'
                                          : svc.serviceType === 'carpet_cleaning'
                                          ? `${item.carpetArea || 0} sq ft`
                                          : svc.serviceType === 'custom_service'
                                          ? `${item.serviceName || 'Service'}${item.notes ? ` — ${item.notes}` : ''}`
                                          : ''}
                                      </span>
                                      <span className="ml-2">
                                        <span className="text-surface-400 dark:text-surface-500">Qty:</span>
                                        <span className="text-surface-600 dark:text-surface-300"> {item.quantity}</span>
                                        {item.price > 0 && (
                                          <>
                                            <span className="text-surface-400 dark:text-surface-500"> · </span>
                                            <span className="text-surface-600 dark:text-surface-300">₹{item.price.toLocaleString('en-IN')}/unit</span>
                                          </>
                                        )}
                                      </span>
                                    </div>
                                    {item.price > 0 && <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium ml-2">₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-surface-500 dark:text-surface-400">1 service</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pricing */}
                    {(() => {
                      const totalCharge = getTotalCharge(card.service_details as Record<string, unknown>);
                      const discount = card.discount ?? 0;
                      if (totalCharge <= 0) return null;
                      const finalAmount = totalCharge - discount;
                      return (
                        <div className="space-y-2">
                          <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-sm font-display font-medium text-surface-600 dark:text-surface-300">Original Total</span>
                            <span className="font-mono text-sm text-surface-700 dark:text-surface-300">₹{totalCharge.toLocaleString('en-IN')}</span>
                          </div>
                          {discount > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center justify-between">
                              <span className="text-sm font-display font-medium text-amber-700 dark:text-amber-300">Discount</span>
                              <span className="font-mono text-sm text-amber-700 dark:text-amber-300">−₹{discount.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4 flex items-center justify-between">
                            <span className="text-sm font-display font-semibold text-cyan-700 dark:text-cyan-300">Final Amount</span>
                            <span className="font-mono text-lg font-bold text-cyan-700 dark:text-cyan-300">₹{finalAmount.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Next service */}
                    {card.next_service_date && (
                      <div className="bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 rounded-xl p-3">
                        <p className="text-sm text-cyan-700 dark:text-cyan-300">Next service due: {new Date(card.next_service_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                    )}

                    {/* Notes */}
                    {card.notes && (
                      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4">
                        <h3 className="text-sm font-display font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide mb-1.5">Notes</h3>
                        <p className="text-body-sm text-surface-700 dark:text-surface-200">{card.notes}</p>
                      </div>
                    )}
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
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const updateCustomer = useUpdateCustomer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setError('');
    setSubmitting(true);

    try {
      const dup = await checkDuplicateCustomer({ name, phone, excludeId: customer.id });
      if (dup) {
        setDuplicateResult(dup);
        trackEvent('duplicate_customer_detected', { customer_name: name, customer_phone: phone, context: 'edit' });
        return;
      }

      await updateCustomer.mutateAsync({
        id: customer.id,
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      trackEvent('customer_updated', { customer_id: customer.id, customer_name: name });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAnyway = async () => {
    setDuplicateResult(null);
    setSubmitting(true);
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      trackEvent('duplicate_customer_creation_confirmed', { customer_name: name, customer_phone: phone, context: 'edit' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDuplicate = () => {
    trackEvent('duplicate_customer_creation_cancelled', { customer_name: name, customer_phone: phone, context: 'edit' });
    setDuplicateResult(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-md shadow-xl">
          <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-600/50">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Edit Customer</h2>
            <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Phone *</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city..."
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Notes / Landmark</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Nearby landmark, directions, special instructions..."
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none" />
            </div>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-lg px-3 py-2">{error}</div>
            )}
            <button type="submit" disabled={submitting}
              className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
      {duplicateResult && (
        <DuplicateWarningModal
          customer={duplicateResult.customer}
          matchType={duplicateResult.type}
          onCancel={handleCancelDuplicate}
          onConfirm={handleCreateAnyway}
        />
      )}
    </>
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
      trackEvent('customer_deleted', { customer_id: customer.id, customer_name: customer.name });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Delete Customer</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-surface-600 dark:text-surface-300 mb-2">
          Are you sure you want to delete <strong>{customer.name}</strong>?
        </p>
        <p className="text-xs text-surface-400 dark:text-surface-500 mb-4">
          This action cannot be undone. Their service history will also be removed.
        </p>
        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600 transition-colors">
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
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const addCustomer = useAddCustomer();

  const handleSelectContact = (contact: { name: string; phone: string }) => {
    if (contact.name) setName(contact.name);
    if (contact.phone) setPhone(contact.phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setError('');
    setSubmitting(true);

    try {
      const dup = await checkDuplicateCustomer({ name, phone });
      if (dup) {
        setDuplicateResult(dup);
        trackEvent('duplicate_customer_detected', { customer_name: name, customer_phone: phone });
        return;
      }

      await addCustomer.mutateAsync({
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      trackEvent('customer_created', { customer_name: name, customer_phone: phone });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAnyway = async () => {
    setDuplicateResult(null);
    setSubmitting(true);
    try {
      await addCustomer.mutateAsync({
        name,
        phone,
        address: address || null,
        notes: notes || null,
      });
      trackEvent('duplicate_customer_creation_confirmed', { customer_name: name, customer_phone: phone });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDuplicate = () => {
    trackEvent('duplicate_customer_creation_cancelled', { customer_name: name, customer_phone: phone });
    setDuplicateResult(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-surface-700 rounded-xl w-full max-w-md shadow-xl">
          <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-600/50">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Add Customer</h2>
            <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-surface-600 dark:text-surface-400">Name *</label>
                <ContactPicker onSelect={handleSelectContact} />
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Phone *</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city..."
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Notes / Landmark</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Nearby landmark, directions, special instructions..."
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 dark:bg-surface-600 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none" />
            </div>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-lg px-3 py-2">{error}</div>
            )}
            <button type="submit" disabled={submitting}
              className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add Customer'}
            </button>
          </form>
        </div>
      </div>
      {duplicateResult && (
        <DuplicateWarningModal
          customer={duplicateResult.customer}
          matchType={duplicateResult.type}
          onCancel={handleCancelDuplicate}
          onConfirm={handleCreateAnyway}
        />
      )}
    </>
  );
}
