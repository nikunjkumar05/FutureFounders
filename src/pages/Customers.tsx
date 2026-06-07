import { useState } from 'react';
import {
  Search,
  Plus,
  Phone,
  MapPin,
  Droplets,
  Bell,
  Check,
  X,
  Users,
} from 'lucide-react';
import {
  useCustomers,
  useServiceCards,
  useMarkReminderSent,
  useAddCustomer,
  useAddServiceCard,
} from '../lib/queries';
import { TableSkeleton } from '../components/LoadingSkeleton';
import type { ServiceCardWithDetails, ServiceType } from '../lib/types';
import { SERVICE_TYPE_LABELS } from '../lib/types';
import { format, differenceInDays } from 'date-fns';

type FilterMode = 'all_due' | 'overdue' | 'due_this_week';

export default function Customers() {
  const { data: customers, isLoading } = useCustomers();
  const { data: serviceCards } = useServiceCards();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all_due');

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
            Manage your customer base and send reminders
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
        <div className="flex gap-2">
          {(
            [
              { key: 'all_due', label: 'Show All Due' },
              { key: 'overdue', label: 'Overdue' },
              { key: 'due_this_week', label: 'Due This Week' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                filter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : !filtered?.length ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Last Service
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Next Service
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Service
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((customer) => {
                  const cards = serviceCards?.filter(
                    (sc) => sc.customer_id === customer.id
                  );
                  const latestCard = cards?.[0];
                  return (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      serviceCard={latestCard ?? null}
                      filter={filter}
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
    </div>
  );
}

function CustomerRow({
  customer,
  serviceCard,
  filter,
}: {
  customer: NonNullable<ReturnType<typeof useCustomers>['data']>[0];
  serviceCard: ServiceCardWithDetails | null;
  filter: FilterMode;
}) {
  const markReminder = useMarkReminderSent();
  const today = new Date();
  const nextDate = serviceCard?.next_service_date
    ? new Date(serviceCard.next_service_date)
    : null;
  const daysOverdue = nextDate ? differenceInDays(today, nextDate) : null;

  const isOverdue = daysOverdue !== null && daysOverdue > 0;
  const isDueThisWeek =
    nextDate &&
    !isOverdue &&
    differenceInDays(nextDate, today) <= 7 &&
    differenceInDays(nextDate, today) >= 0;
  const isAllDue = isOverdue || isDueThisWeek;

  if (filter === 'overdue' && !isOverdue) return null;
  if (filter === 'due_this_week' && !isDueThisWeek) return null;
  if (filter === 'all_due' && !isAllDue) return null;

  const statusColor = isOverdue
    ? 'bg-red-100 text-red-700'
    : isDueThisWeek
    ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700';

  const statusLabel = isOverdue
    ? `${daysOverdue}d overdue`
    : isDueThisWeek
    ? 'Due soon'
    : 'On track';

  const reminderSent = !!serviceCard?.reminder_sent_at;

  const handleSendReminder = () => {
    if (!serviceCard || reminderSent) return;
    const type = serviceCard.service_type as ServiceType;
    const label = SERVICE_TYPE_LABELS[type] ?? 'cleaning';
    const messages: Record<string, string> = {
      standard_cleaning: `Hi ${customer.name}! It's been 6 months since your water tank cleaning with us. Dirty tanks breed bacteria — your family's health matters! Book your cleaning today. Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      sofa_cleaning: `Hi ${customer.name}! It's time for your sofa cleaning service. Keep your furniture fresh and hygienic! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
      seats_cleaning: `Hi ${customer.name}! It's time for your seats cleaning service. Enjoy a fresh and clean ride! Reply YES to confirm or call us at 9876543210. — AquaClean Services`,
    };
    const template = messages[type] ?? messages.standard_cleaning;
    window.open(
      `https://wa.me/91${customer.phone}?text=${encodeURIComponent(template)}`
    );
    markReminder.mutate({ cardId: serviceCard.id });
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            {customer.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-slate-900">{customer.name}</p>
            {customer.address && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin size={10} />
                {customer.address}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-600 flex items-center gap-1">
          <Phone size={12} />
          {customer.phone}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600">
        {serviceCard?.service_date
          ? format(new Date(serviceCard.service_date), 'dd MMM yyyy')
          : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-600">
            {nextDate ? format(nextDate, 'dd MMM yyyy') : '—'}
          </span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor}`}
          >
            {statusLabel}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1 text-slate-600">
          <Droplets size={12} />
          {serviceCard
            ? `${SERVICE_TYPE_LABELS[serviceCard.service_type as ServiceType] ?? serviceCard.service_type}${serviceCard.quantity ? ` (${serviceCard.quantity}${serviceCard.service_type === 'standard_cleaning' ? 'L' : 'pc'})` : ` ${customer.tank_capacity_liters}L`}`
            : `${customer.tank_capacity_liters}L`}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={handleSendReminder}
          disabled={reminderSent}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            reminderSent
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {reminderSent ? (
            <>
              <Check size={12} /> Sent
            </>
          ) : (
            <>
              <Bell size={12} /> Send Reminder
            </>
          )}
        </button>
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
        Add your first customer to start managing service reminders.
      </p>
    </div>
  );
}

const serviceTypeOptions: { value: ServiceType; label: string }[] = [
  { value: 'standard_cleaning', label: 'Tank Cleaning' },
  { value: 'sofa_cleaning', label: 'Sofa Cleaning' },
  { value: 'seats_cleaning', label: 'Seats Cleaning' },
];

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('standard_cleaning');
  const [tankCapacity, setTankCapacity] = useState('1000');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const addCustomer = useAddCustomer();
  const addServiceCard = useAddServiceCard();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setError('');
    setSubmitting(true);

    try {
      const result = await addCustomer.mutateAsync({
        name,
        phone,
        address: address || null,
        latitude: null,
        longitude: null,
        tank_capacity_liters: parseInt(tankCapacity) || 1000,
      });

      const today = new Date().toISOString().slice(0, 10);
      await addServiceCard.mutateAsync({
        customerId: result.id,
        serviceDate: today,
        serviceType,
        quantity: quantity ? parseInt(quantity) : undefined,
        notes: 'Initial service record',
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Add Customer
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Phone *
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Address
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Service Type
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {serviceTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {serviceType === 'standard_cleaning' ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tank Capacity (Liters)
              </label>
              <input
                type="number"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {serviceType === 'sofa_cleaning' ? 'Number of Sofas' : 'Number of Seats'}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={serviceType === 'sofa_cleaning' ? 'e.g. 3' : 'e.g. 5'}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Customer'}
          </button>
        </form>
      </div>
    </div>
  );
}
