import { useEffect, useState } from "react";
import type { Job } from "../types";
import { getJobs, completeJob } from "../api";

interface Props {
  refresh: number;
  onRefresh: () => void;
}

const statusBorder: Record<string, string> = {
  scheduled:   "border-left-cyan",
  in_progress: "border-left-blue",
  completed:   "border-left-cyan",
  cancelled:   "border-left-red",
};

export default function JobList({ refresh, onRefresh }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleComplete(job: Job) {
    setCompleting(job.id);
    try {
      await completeJob(job.id);
      onRefresh();
    } finally {
      setCompleting(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-[68px] card animate-pulse" />)}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-syne text-lg tracking-wide text-white mb-4">Job Queue</h2>
      <div className="space-y-2.5">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`card px-4 py-3 flex items-center justify-between ${statusBorder[job.status] ?? "border-left-cyan"}`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-plus text-sm font-medium text-gray-100 truncate">{job.customer}</span>
                  {job.status === "completed" && (
                    <span className="font-dm-mono text-[10px] uppercase tracking-wide text-gray-500">COMPLETED</span>
                  )}
                </div>
                <div className="font-dm-mono text-[11px] text-gray-600 mt-0.5">
                  {job.worker ?? "Unassigned"}
                  {job.scheduled_date && <>,&nbsp;{new Date(job.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-3">
              {job.status === "scheduled" && (
                <button
                  onClick={() => handleComplete(job)}
                  disabled={completing === job.id}
                  className="font-dm-mono text-[11px] font-medium px-3 py-1.5 rounded-md transition-all duration-200 disabled:opacity-40 cursor-pointer"
                  style={{
                    background: "rgba(20,184,166,0.12)",
                    color: "#14b8a6",
                    border: "1px solid rgba(20,184,166,0.2)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.22)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(20,184,166,0.12)"; }}
                >
                  {completing === job.id ? "..." : "COMPLETE"}
                </button>
              )}
              {job.status === "completed" && job.completed_at && (
                <div className="font-dm-mono text-[11px] text-gray-600 text-right leading-tight">
                  {new Date(job.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                </div>
              )}
            </div>
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="card py-10 text-center">
            <p className="font-plus text-sm text-gray-600">No jobs yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
