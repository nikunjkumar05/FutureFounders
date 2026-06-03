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
        <h2 className="font-syne text-lg tracking-wide text-white mb-4">Attendance</h2>
        {[1, 2].map((i) => <div key={i} className="h-16 card animate-pulse mb-3" />)}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-syne text-lg tracking-wide text-white mb-4">Attendance</h2>
      <div className="space-y-2.5">
        {workers.map((w) => {
          const checkedIn = w.check_in_status === "on_time";
          return (
            <div key={w.id} className={`card px-4 py-3 flex items-center justify-between ${checkedIn ? "border-left-cyan" : ""}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${checkedIn ? "bg-cyan" : "bg-gray-600"}`} />
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
                    className="font-dm-mono text-[10px] font-medium px-3 py-1.5 rounded-md transition-all duration-200 disabled:opacity-40 cursor-pointer"
                    style={{
                      background: "rgba(20,184,166,0.12)",
                      color: "#14b8a6",
                      border: "1px solid rgba(20,184,166,0.2)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.22)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.12)"; }}
                  >
                    {checking === w.id ? "..." : "MARK PRESENT"}
                  </button>
                )}
                {checkedIn && (
                  <span className="font-dm-mono text-[10px] text-gray-600 uppercase tracking-wide">Present</span>
                )}
                {!checkedIn && !w.job_id && (
                  <span className="font-dm-mono text-[10px] text-gray-600 uppercase tracking-wide">Idle</span>
                )}
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
