import { useEffect, useState } from "react";
import type { Job } from "../types";
import { getJobs, completeJob } from "../api";

interface Props {
  refresh: number;
  onRefresh: () => void;
}

const statusMeta: Record<string, { label: string; border: string; dot: string }> = {
  scheduled:   { label: "Scheduled",  border: "border-left-amber", dot: "bg-amber-400" },
  in_progress: { label: "In Progress", border: "border-left-blue",  dot: "bg-blue-400"  },
  completed:   { label: "Completed",  border: "border-left-teal",  dot: "bg-teal-400"  },
  cancelled:   { label: "Overdue",    border: "border-left-red",   dot: "bg-red-400"   },
};

export default function JobList({ refresh, onRefresh }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [burstId, setBurstId] = useState<string | null>(null);

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleComplete(job: Job) {
    setCompleting(job.id);
    try {
      await completeJob(job.id);
      setBurstId(job.id);
      setTimeout(() => setBurstId(null), 600);
      onRefresh();
    } finally {
      setCompleting(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 glass rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-syne text-lg text-white tracking-wide mb-4">Job Queue</h2>
      <div className="space-y-3">
        {jobs.map((job, idx) => {
          const meta = statusMeta[job.status] ?? statusMeta.scheduled;
          return (
            <div
              key={job.id}
              className={`glass rounded-xl p-4 flex items-center justify-between transition-all duration-300 ${meta.border} ${burstId === job.id ? "burst" : ""}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-plus text-sm font-medium text-gray-100 truncate">{job.customer}</span>
                    <span className="font-dm-mono text-[10px] uppercase tracking-wider text-gray-500">{meta.label}</span>
                  </div>
                  <div className="font-dm-mono text-xs text-gray-600">
                    {job.worker ?? "Unassigned"}
                    {job.scheduled_date && <>,&nbsp;{new Date(job.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-4">
                {job.status === "scheduled" && (
                  <button
                    onClick={() => handleComplete(job)}
                    disabled={completing === job.id}
                    className="font-plus text-xs font-medium px-4 py-2 rounded-lg transition-all duration-200"
                    style={{
                      background: "rgba(20,184,166,0.15)",
                      color: "#14b8a6",
                      border: "1px solid rgba(20,184,166,0.25)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.25)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.15)"; }}
                  >
                    {completing === job.id ? "..." : "Mark Done"}
                  </button>
                )}
                {job.status === "completed" && job.completed_at && (
                  <div className="font-dm-mono text-[11px] text-gray-600 text-right leading-tight">
                    Done<br />{new Date(job.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div className="glass rounded-xl py-12 text-center">
            <p className="font-plus text-sm text-gray-600">No jobs yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
