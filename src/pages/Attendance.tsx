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
} from '../lib/queries';
import { format } from 'date-fns';
import type { Staff } from '../lib/types';

export default function Attendance() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: staff, isLoading: staffLoading } = useStaff();
  const { data: attendance, isLoading: attLoading } = useAttendance(selectedDate);
  const [modalStaff, setModalStaff] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);

  if (staffLoading || attLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  const attendanceMap = new Map<string, NonNullable<typeof attendance>[0]>();
  attendance?.forEach((a) => attendanceMap.set(a.staff_id, a));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">
            Staff attendance and wage tracking
          </p>
        </div>
        <button
          onClick={() => setShowAddStaff(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Staff
        </button>
      </div>

      {/* Date selector */}
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <CalendarDays size={16} />
          Date:
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </label>
      </div>

      {(!staff || staff.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <User size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No staff members</h3>
          <p className="text-sm text-slate-500">Add your first staff member to start tracking attendance.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {format(new Date(selectedDate), 'dd MMM yyyy')}
            </h2>
            <span className="text-xs text-slate-500">
              {attendance?.length ?? 0} checked in
            </span>
          </div>
          <div className="divide-y divide-slate-100">
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
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">
                          {s.name}
                        </p>
                        <p className="text-xs text-slate-400">{s.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={status} />
                      <div className="flex gap-2">
                        {!att?.checkin_time && (
                          <button
                            onClick={() => setModalStaff(s.id)}
                            className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Check In
                          </button>
                        )}
                        {att?.checkin_time && !att.checkout_time && (
                          <button
                            onClick={() =>
                              setExpandedStaff(
                                expandedStaff === s.id ? null : s.id
                              )
                            }
                            className="text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Check Out
                          </button>
                        )}
                        <button
                          onClick={() => setEditStaff(s)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit staff"
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
          className="text-[10px] font-medium text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded transition-colors"
        >
          Sure?
        </button>
        <button onClick={() => setConfirming(false)} className="text-[10px] text-slate-400 hover:text-slate-600">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
      color: 'bg-green-100 text-green-700',
      icon: CheckCircle,
    },
    checked_out: {
      label: 'Checked Out',
      color: 'bg-slate-100 text-slate-600',
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
      <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-2.5">
        <p className="text-sm text-slate-600">
          Check out <span className="font-medium">{staffName}</span>?
        </p>
        <button
          onClick={() => {
            checkOut.mutate({ attendanceId }, { onSuccess: onDone });
          }}
          disabled={checkOut.isPending}
          className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-md transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Manual Check-In</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <input readOnly value={date} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
            <input readOnly value={format(new Date(), 'HH:mm')} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {checkIn.isPending ? 'Checking in...' : 'Confirm Check-In'}
          </button>
        </div>
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
        'Daily Wage': r.staff?.daily_wage_inr ?? 0,
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
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Monthly Wage Calculator — {format(new Date(), 'MMM yyyy')}
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={14} />
          Export CSV ({exportData?.length ?? 0} records)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Staff</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Daily Wage</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Present Days</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Est. Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
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
  const presentDays = monthlyAtt?.length ?? 0;
  const payout = presentDays * staff.daily_wage_inr;

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 font-medium text-slate-900">{staff.name}</td>
      <td className="px-3 py-2 text-slate-600">₹{staff.daily_wage_inr.toLocaleString()}</td>
      <td className="px-3 py-2 text-slate-600">{presentDays}</td>
      <td className="px-3 py-2 font-semibold text-green-700">₹{payout.toLocaleString()}</td>
    </tr>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dailyWage, setDailyWage] = useState('500');
  const addStaff = useAddStaff();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    addStaff.mutate(
      { name, phone, dailyWage: parseInt(dailyWage) || 500 },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Add Staff</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Daily Wage (₹)</label>
            <input type="number" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={addStaff.isPending} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
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
  const [dailyWage, setDailyWage] = useState(String(staff.daily_wage_inr));
  const [isActive, setIsActive] = useState(staff.is_active);
  const updateStaff = useUpdateStaff();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStaff.mutate(
      { id: staff.id, name, phone, dailyWage: parseInt(dailyWage) || 500, isActive },
      { onSuccess: onClose }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Edit Staff</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Daily Wage (₹)</label>
            <input type="number" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300" />
            Active staff member
          </label>
          <button type="submit" disabled={updateStaff.isPending} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
            {updateStaff.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
