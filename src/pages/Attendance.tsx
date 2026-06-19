import { useState, useCallback } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  User,
  X,
  Download,
  Plus,
  CalendarDays,
  Trash2,
  Pencil,
} from 'lucide-react';
import {
  useStaff,
  useAttendance,
  useManualCheckIn,
  useManualCheckOut,
  useMonthlyAttendance,
  useMonthlyAttendanceExport,
  useAddStaff,
  useUpdateStaff,
  useDeleteStaff,
  useAdvances,
  useStaffMonthlyAdvances,
  useAddAdvance,
  useUpdateAdvance,
  useDeleteAdvance,
} from '../lib/queries';
import { format } from 'date-fns';
import ContactPicker from '../components/ContactPicker';
import type { Staff, WageType, Advance } from '../lib/types';
import { WAGE_TYPE_LABELS } from '../lib/types';

export default function Attendance() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: staff, isLoading: staffLoading } = useStaff();
  const { data: attendance, isLoading: attLoading } = useAttendance(selectedDate);
  const [modalStaff, setModalStaff] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [advancesStaff, setAdvancesStaff] = useState<string | null>(null);

  if (staffLoading || attLoading) {
    return (
      <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-8 text-center text-surface-400 dark:text-surface-500 text-sm">
        Loading...
      </div>
    );
  }

  const attendanceMap = new Map<string, NonNullable<typeof attendance>[0]>();
  attendance?.forEach((a) => attendanceMap.set(a.staff_id, a));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display text-surface-900 dark:text-surface-100">Shifts</h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            Staff attendance and wage tracking
          </p>
        </div>
        <button
          onClick={() => setShowAddStaff(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          Add crew member
        </button>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-surface-500 dark:text-surface-400" />
        <label className="text-body-sm text-surface-600 dark:text-surface-300">Date:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="input-base !w-auto"
        />
      </div>

      {(!staff || staff.length === 0) ? (
        <div className="card-base p-12 text-center">
          <User size={40} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
          <h3 className="text-display-sm font-display text-surface-700 dark:text-surface-200 mb-1">No crew members</h3>
          <p className="text-body-sm text-surface-500 dark:text-surface-400">Add your first crew member to start tracking shifts.</p>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold text-surface-900 dark:text-surface-100">
              {format(new Date(selectedDate), 'dd MMM yyyy')}
            </h2>
            <span className="badge-neutral">
              {attendance?.length ?? 0} checked in
            </span>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {staff.map((s) => {
              const att = attendanceMap.get(s.id);
              const status = att
                ? att.checkin_time && !att.checkout_time
                  ? 'checked_in'
                  : att.checkout_time
                  ? 'checked_out'
                  : 'absent'
                : 'not_yet';

              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 flex items-center justify-center text-xs font-display font-bold">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-display font-medium text-surface-900 dark:text-surface-100 text-sm">
                          {s.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="font-mono text-body-xs text-surface-500 dark:text-surface-400">{s.phone}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-navy-50 dark:bg-navy-900/30 text-navy-600 dark:text-navy-400 font-medium">
                            {WAGE_TYPE_LABELS[s.wage_type ?? 'daily']} · ₹{((s.wage_amount || s.daily_wage_inr)).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={status} />
                      <div className="flex gap-2">
                        {!att?.checkin_time && (
                          <button
                            onClick={() => setModalStaff(s.id)}
                            className="btn-primary !py-1.5 !text-xs"
                          >
                            Start shift
                          </button>
                        )}
                        {att?.checkin_time && !att.checkout_time && (
                          <button
                            onClick={() =>
                              setExpandedStaff(
                                expandedStaff === s.id ? null : s.id
                              )
                            }
                            className="btn-secondary !py-1.5 !text-xs"
                          >
                            End shift
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setAdvancesStaff(
                              advancesStaff === s.id ? null : s.id
                            )
                          }
                          className="btn-ghost !py-1.5 !text-xs"
                          title="Advances"
                        >
                          ₹ Advances
                        </button>
                        <button
                          onClick={() => setEditStaff(s)}
                          className="btn-ghost p-1.5"
                          title="Edit crew member"
                        >
                          <Pencil size={12} />
                        </button>
                        <DeleteStaffButton staffId={s.id} staffName={s.name} />
                      </div>
                    </div>
                  </div>

                  {expandedStaff === s.id && att && (
                    <CheckOutSection
                      attendanceId={att.id}
                      staffName={s.name}
                      onDone={() => setExpandedStaff(null)}
                    />
                  )}
                  {advancesStaff === s.id && (
                    <AdvanceManagement staffId={s.id} staffName={s.name} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Wage Calculator */}
      <div className="mt-8">
        <WageCalculator staff={staff ?? []} />
      </div>

      {modalStaff && (
        <CheckInModal
          staffId={modalStaff}
          onClose={() => setModalStaff(null)}
          notes={modalNotes}
          setNotes={setModalNotes}
          date={selectedDate}
        />
      )}
      {showAddStaff && <AddStaffModal onClose={() => setShowAddStaff(false)} />}
      {editStaff && <EditStaffModal staff={editStaff} onClose={() => setEditStaff(null)} />}
    </div>
  );
}

function DeleteStaffButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteStaff();

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => { del.mutate({ id: staffId }); setConfirming(false); }}
          className="text-[10px] font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 px-1.5 py-0.5 rounded transition-colors"
        >
          Sure?
        </button>
        <button onClick={() => setConfirming(false)} className="text-[10px] text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-lg text-surface-400 dark:text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
      title={`Remove ${staffName}`}
    >
      <Trash2 size={12} />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    checked_in: {
      label: 'Checked In',
      color: 'bg-cyan-100 text-cyan-700',
      icon: CheckCircle,
    },
    checked_out: {
      label: 'Checked Out',
      color: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300',
      icon: Clock,
    },
    absent: { label: 'Absent', color: 'bg-red-100 text-red-700', icon: XCircle },
    not_yet: {
      label: 'Not Yet',
      color: 'bg-amber-100 text-amber-700',
      icon: User,
    },
  };
  const { label, color, icon: Icon } = config[status] ?? config.not_yet;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function CheckOutSection({
  attendanceId,
  staffName,
  onDone,
}: {
  attendanceId: string;
  staffName: string;
  onDone: () => void;
}) {
  const checkOut = useManualCheckOut();

  return (
    <div className="px-4 pb-3 pl-16">
      <div className="flex items-center gap-3 bg-surface-50 dark:bg-surface-700/50 rounded-lg px-4 py-2.5">
        <p className="text-sm text-surface-600 dark:text-surface-300">
          Check out <span className="font-medium">{staffName}</span>?
        </p>
        <button
          onClick={() => {
            checkOut.mutate({ attendanceId }, { onSuccess: onDone });
          }}
          disabled={checkOut.isPending}
          className="text-xs font-medium text-white bg-navy-600 hover:bg-navy-700 px-4 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          {checkOut.isPending ? 'Checking out...' : 'Confirm Check-Out'}
        </button>
      </div>
    </div>
  );
}

function CheckInModal({
  staffId,
  onClose,
  notes,
  setNotes,
  date,
}: {
  staffId: string;
  onClose: () => void;
  notes: string;
  setNotes: (v: string) => void;
  date: string;
}) {
  const checkIn = useManualCheckIn();

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700/50">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Manual Check-In</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Date</label>
            <input readOnly value={date} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm bg-surface-50 dark:bg-surface-700/50 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Time</label>
            <input readOnly value={format(new Date(), 'HH:mm')} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm bg-surface-50 dark:bg-surface-700/50 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note..."
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <button
            onClick={() => {
              checkIn.mutate(
                { staffId, notes: notes || undefined, date },
                { onSuccess: onClose }
              );
            }}
            disabled={checkIn.isPending}
            className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {checkIn.isPending ? 'Checking in...' : 'Confirm Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceManagement({ staffId, staffName }: { staffId: string; staffName: string }) {
  const { data: advances, isLoading } = useAdvances(staffId);
  const addAdvance = useAddAdvance();
  const updateAdvance = useUpdateAdvance();
  const deleteAdvance = useDeleteAdvance();

  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newReason, setNewReason] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');

  const handleAdd = () => {
    const amount = parseInt(newAmount);
    if (!newAmount || isNaN(amount) || amount <= 0) return;
    addAdvance.mutate(
      { staffId, amount, date: newDate, reason: newReason || undefined },
      { onSuccess: () => { setNewAmount(''); setNewReason(''); } }
    );
  };

  const startEdit = (adv: Advance) => {
    setEditId(adv.id);
    setEditAmount(String(adv.amount));
    setEditDate(adv.date);
    setEditReason(adv.reason ?? '');
  };

  const handleEdit = () => {
    const amount = parseInt(editAmount);
    if (!editId || !editAmount || isNaN(amount) || amount <= 0) return;
    updateAdvance.mutate(
      { id: editId, staffId, amount, date: editDate, reason: editReason || undefined },
      { onSuccess: () => setEditId(null) }
    );
  };

  const totalAdvances = (advances ?? []).reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="px-4 pb-3 pl-16">
      <div className="bg-surface-50 dark:bg-surface-700/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200 uppercase tracking-wider">
            Advance Payments — {staffName}
          </h3>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            Total: ₹{totalAdvances.toLocaleString()}
          </span>
        </div>

        {/* Add advance form */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Amount</label>
            <input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="₹"
              className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <div className="w-32">
            <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-medium text-surface-500 dark:text-surface-400 mb-0.5">Reason</label>
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Optional reason..."
              className="w-full px-2 py-1.5 rounded border border-surface-200 dark:border-surface-600 text-xs focus:outline-none focus:ring-1 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={addAdvance.isPending}
            className="px-3 py-1.5 bg-navy-600 text-white rounded-lg text-xs font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {addAdvance.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>

        {/* Advances table */}
        {isLoading ? (
          <p className="text-xs text-surface-400 dark:text-surface-500">Loading...</p>
        ) : !advances || advances.length === 0 ? (
          <p className="text-xs text-surface-400 dark:text-surface-500">No advance payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-600">
                  <th className="text-left px-2 py-1 font-semibold text-surface-500 dark:text-surface-400 uppercase">Date</th>
                  <th className="text-left px-2 py-1 font-semibold text-surface-500 dark:text-surface-400 uppercase">Amount</th>
                  <th className="text-left px-2 py-1 font-semibold text-surface-500 dark:text-surface-400 uppercase">Reason</th>
                  <th className="text-right px-2 py-1 font-semibold text-surface-500 dark:text-surface-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700/50">
                {advances.map((adv) => (
                  <tr key={adv.id} className="hover:bg-surface-100/50 dark:hover:bg-surface-700/30">
                    {editId === adv.id ? (
                      <>
                        <td className="px-2 py-1">
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full px-1.5 py-1 rounded border border-surface-200 dark:border-surface-600 text-xs dark:bg-surface-700 dark:text-white"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="w-20 px-1.5 py-1 rounded border border-surface-200 dark:border-surface-600 text-xs dark:bg-surface-700 dark:text-white"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            className="w-full px-1.5 py-1 rounded border border-surface-200 dark:border-surface-600 text-xs dark:bg-surface-700 dark:text-white"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleEdit}
                              disabled={updateAdvance.isPending}
                              className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="text-[10px] text-surface-400 hover:text-surface-600 px-1"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1 text-surface-700 dark:text-surface-200">{format(new Date(adv.date), 'dd MMM yyyy')}</td>
                        <td className="px-2 py-1 font-medium text-surface-900 dark:text-white">₹{adv.amount.toLocaleString()}</td>
                        <td className="px-2 py-1 text-surface-500 dark:text-surface-400">{adv.reason ?? '—'}</td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => startEdit(adv)} className="text-[10px] text-navy-600 dark:text-navy-400 hover:text-navy-800 px-1">
                              <Pencil size={10} />
                            </button>
                            <button
                              onClick={() => deleteAdvance.mutate({ id: adv.id, staffId })}
                              disabled={deleteAdvance.isPending}
                              className="text-[10px] text-red-500 hover:text-red-700 px-1 disabled:opacity-50"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function WageCalculator({ staff }: { staff: Staff[] }) {
  const month = format(new Date(), 'yyyy-MM');
  const { data: exportData, refetch: fetchExport } = useMonthlyAttendanceExport(month);

  const handleExport = useCallback(async () => {
    const result = await fetchExport();
    const records = result.data;
    if (!records || records.length === 0) {
      alert('No attendance records found for this month.');
      return;
    }

    try {
      const csvRows = records.map(r => ({
        Staff: r.staff?.name ?? '',
        Phone: '',
        Date: r.date,
        'Check In': r.checkin_time ? format(new Date(r.checkin_time), 'HH:mm') : '',
        'Check Out': r.checkout_time ? format(new Date(r.checkout_time), 'HH:mm') : '',
        'Wage Type': r.staff?.wage_type ?? 'daily',
        'Wage Amount': r.staff?.wage_amount ?? r.staff?.daily_wage_inr ?? 0,
      }));

      const headers = Object.keys(csvRows[0]);
      const csv = [
        headers.join(','),
        ...csvRows.map(r => headers.map(h => `"${String((r as Record<string, unknown>)[h] ?? '')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to generate CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }, [month, fetchExport]);

  return (
    <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-white">
          Monthly Wage Calculator — {format(new Date(), 'MMM yyyy')}
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-700 bg-navy-50 hover:bg-navy-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={14} />
          Export CSV ({exportData?.length ?? 0} records)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-100 dark:border-surface-700/50">
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Staff</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Wage Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Base Wage</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Present Days</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Gross Earnings</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Advances</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">Net Payable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700/50">
            {staff.map((s) => (
              <WageRow key={s.id} staff={s} month={month} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WageRow({ staff, month }: { staff: Staff; month: string }) {
  const { data: monthlyAtt } = useMonthlyAttendance(staff.id, month);
  const { data: monthlyAdvances } = useStaffMonthlyAdvances(staff.id, month);
  const presentDays = monthlyAtt?.length ?? 0;
  const totalAdvances = (monthlyAdvances ?? []).reduce((sum, a) => sum + a.amount, 0);

  const wageType: WageType = staff.wage_type ?? 'daily';
  const wageAmount = staff.wage_amount || staff.daily_wage_inr;

  let grossEarnings = 0;
  if (wageType === 'daily') {
    grossEarnings = presentDays * wageAmount;
  } else if (wageType === 'weekly') {
    grossEarnings = Math.floor((presentDays / 7) * wageAmount);
  } else {
    grossEarnings = wageAmount;
  }

  const netPayable = Math.max(0, grossEarnings - totalAdvances);

  return (
    <tr className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
      <td className="px-3 py-2 font-medium text-surface-900 dark:text-white">{staff.name}</td>
      <td className="px-3 py-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-navy-50 dark:bg-navy-900/30 text-navy-600 dark:text-navy-400 font-medium">
          {WAGE_TYPE_LABELS[wageType]}
        </span>
      </td>
      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">₹{wageAmount.toLocaleString()}</td>
      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">{presentDays}</td>
      <td className="px-3 py-2 text-surface-600 dark:text-surface-300">₹{grossEarnings.toLocaleString()}</td>
      <td className="px-3 py-2 text-red-600 dark:text-red-400">₹{totalAdvances.toLocaleString()}</td>
      <td className="px-3 py-2 font-semibold text-cyan-700">₹{netPayable.toLocaleString()}</td>
    </tr>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [wageType, setWageType] = useState<WageType>('daily');
  const [wageAmount, setWageAmount] = useState('500');
  const addStaff = useAddStaff();

  const wageTypePlaceholder: Record<WageType, string> = {
    daily: 'Daily wage amount (e.g. 500)',
    weekly: 'Weekly wage amount (e.g. 4000)',
    monthly: 'Monthly salary (e.g. 18000)',
  };

  const handleSelectContact = (contact: { name: string; phone: string }) => {
    if (contact.name) setName(contact.name);
    if (contact.phone) setPhone(contact.phone);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    addStaff.mutate(
      { name, phone, wageType, wageAmount: parseInt(wageAmount) || 500 },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700/50">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Add Staff</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-400">Name *</label>
              <ContactPicker onSelect={handleSelectContact} />
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Wage Type</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as WageType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setWageType(type); setWageAmount(type === 'daily' ? '500' : type === 'weekly' ? '4000' : '18000'); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    wageType === type
                      ? 'bg-navy-600 text-white border-navy-600'
                      : 'border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-navy-400'
                  }`}
                >
                  {WAGE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Wage Amount (₹) — {WAGE_TYPE_LABELS[wageType]}
            </label>
            <input
              type="number"
              value={wageAmount}
              onChange={(e) => setWageAmount(e.target.value)}
              placeholder={wageTypePlaceholder[wageType]}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <button type="submit" disabled={addStaff.isPending} className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50">
            {addStaff.isPending ? 'Adding...' : 'Add Staff'}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditStaffModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const [name, setName] = useState(staff.name);
  const [phone, setPhone] = useState(staff.phone);
  const [wageType, setWageType] = useState<WageType>(staff.wage_type || 'daily');
  const [wageAmount, setWageAmount] = useState(String(staff.wage_amount || staff.daily_wage_inr));
  const [isActive, setIsActive] = useState(staff.is_active);
  const updateStaff = useUpdateStaff();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStaff.mutate(
      { id: staff.id, name, phone, wageType, wageAmount: parseInt(wageAmount) || 500, isActive },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-navy-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700/50">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Edit Staff</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Wage Type</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as WageType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setWageType(type)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    wageType === type
                      ? 'bg-navy-600 text-white border-navy-600'
                      : 'border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-navy-400'
                  }`}
                >
                  {WAGE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">
              Wage Amount (₹) — {WAGE_TYPE_LABELS[wageType]}
            </label>
            <input
              type="number"
              value={wageAmount}
              onChange={(e) => setWageAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 dark:bg-surface-700 dark:text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-surface-300 dark:border-surface-600" />
            Active staff member
          </label>
          <button type="submit" disabled={updateStaff.isPending} className="w-full bg-navy-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50">
            {updateStaff.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
