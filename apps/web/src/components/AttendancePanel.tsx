import { useEffect, useState } from "react";
import type { WorkerAttendance } from "../types";
import { getAttendance, manualCheckin } from "../api";

interface Props {
  refresh: number;
  onRefresh: () => void;
}

export default function AttendancePanel({ refresh, onRefresh }: Props) {
  const [workers, setWorkers] = useState<WorkerAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);

  useEffect(() => {
    getAttendance()
      .then(setWorkers)
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleCheckin(workerId: string, jobId: string | null) {
    setChecking(workerId);
    try {
      await manualCheckin(workerId, jobId);
      onRefresh();
    } finally {
      setChecking(null);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
          <h2 className="font-syne text-lg tracking-wide text-white">Attendance</h2>
        </div>
        {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl skeleton mb-3" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-blue shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
        <h2 className="font-syne text-lg tracking-wide text-white">Attendance</h2>
      </div>
      <div className="space-y-2.5">
        {workers.map((w) => {
          const checkedIn = w.check_in_status === "on_time";
          return (
            <div key={w.id} className={`card px-4 py-3.5 flex items-center justify-between ${checkedIn ? "border-left-emerald" : ""}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${checkedIn ? "bg-emerald" : "bg-gray-600"}`}
                  style={checkedIn ? { boxShadow: "0 0 6px rgba(34,197,94,0.4)" } : {}} />
                <div className="min-w-0">
                  <div className="font-plus text-sm font-medium text-gray-100 truncate">{w.name}</div>
                  <div className="font-dm-mono text-[11px] text-gray-600 mt-0.5">
                    {w.job_status === "in_progress"
                      ? `At ${w.customer ?? "job site"}`
                      : w.job_status === "scheduled"
                        ? `Assigned to ${w.customer ?? "job"}`
                        : checkedIn
                          ? "Checked in"
                          : "No assignment"}
                  </div>
                </div>
              </div>

              <div className="shrink-0 ml-3">
                {!checkedIn && w.job_id && (
                  <button
                    onClick={() => handleCheckin(w.id, w.job_id)}
                    disabled={checking === w.id}
                    className="font-dm-mono text-[10px] font-medium px-3 py-1.5 rounded-md btn-cyan disabled:opacity-30 tracking-wider"
                  >
                    {checking === w.id ? "..." : "Check In"}
                  </button>
                )}
                {checkedIn && <span className="badge badge-green">Present</span>}
                {!checkedIn && !w.job_id && <span className="badge badge-gray">Idle</span>}
              </div>
            </div>
          );
        })}

        {workers.length === 0 && (
          <div className="card py-8 text-center">
            <p className="font-plus text-sm text-gray-600">No workers</p>
          </div>
        )}
      </div>
    </div>
  );
}
