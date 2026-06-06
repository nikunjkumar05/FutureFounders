import { useState, useCallback } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  User,
  X,
  Download,
} from 'lucide-react';
import {
  useStaff,
  useAttendance,
  useManualCheckIn,
  useManualCheckOut,
  useMonthlyAttendance,
  useMonthlyAttendanceExport,
} from '../lib/queries';
import { format } from 'date-fns';
import { TableSkeleton } from '../components/LoadingSkeleton';

export default function Attendance() {
  const { data: staff, isLoading: staffLoading } = useStaff();
  const { data: attendance, isLoading: attLoading } = useAttendance();
  const [modalStaff, setModalStaff] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  if (staffLoading || attLoading) return <TableSkeleton rows={4} cols={5} />;

  const attendanceMap = new Map<string, NonNullable<typeof attendance>[0]>();
  attendance?.forEach((a) => attendanceMap.set(a.staff_id, a));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
        <p className="text-slate-500 text-sm mt-1">
          Today's staff attendance and wage tracking
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Today — {format(new Date(), 'dd MMM yyyy')}
          </h2>
          <span className="text-xs text-slate-500">
            {attendance?.length ?? 0} checked in
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {staff?.map((s) => {
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
        />
      )}
    </div>
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
}: {
  staffId: string;
  onClose: () => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  const checkIn = useManualCheckIn();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Manual Check-In
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Time
            </label>
            <input
              readOnly
              value={format(new Date(), 'HH:mm')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Notes
            </label>
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
                { staffId, notes: notes || undefined },
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

function WageCalculator({ staff }: { staff: NonNullable<ReturnType<typeof useStaff>['data']> }) {
  const month = format(new Date(), 'yyyy-MM');
  const { refetch: fetchExport } = useMonthlyAttendanceExport(month);

  const handleExport = useCallback(async () => {
    const { data: records } = await fetchExport();
    if (!records || records.length === 0) return;

    const rows = records.map(r => ({
      Staff: r.staff?.name ?? '',
      Phone: '',
      Date: r.date,
      'Check In': r.checkin_time ? format(new Date(r.checkin_time), 'HH:mm') : '',
      'Check Out': r.checkout_time ? format(new Date(r.checkout_time), 'HH:mm') : '',
      'Daily Wage': `₹${r.staff?.daily_wage_inr ?? 0}`,
    }));

    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                Staff
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                Daily Wage
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                Present Days
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                Est. Payout
              </th>
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

function WageRow({ staff, month }: { staff: NonNullable<ReturnType<typeof useStaff>['data']>[0]; month: string }) {
  const { data: monthlyAtt } = useMonthlyAttendance(staff.id, month);
  const presentDays = monthlyAtt?.length ?? 0;
  const payout = presentDays * staff.daily_wage_inr;

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 font-medium text-slate-900">{staff.name}</td>
      <td className="px-3 py-2 text-slate-600">
        ₹{staff.daily_wage_inr.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-slate-600">{presentDays}</td>
      <td className="px-3 py-2 font-semibold text-green-700">
        ₹{payout.toLocaleString()}
      </td>
    </tr>
  );
}
