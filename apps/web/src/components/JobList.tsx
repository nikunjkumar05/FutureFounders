import { useEffect, useState } from "react";
import type { Job } from "../types";
import { getJobs, completeJob } from "../api";

interface Props {
  refresh: number;
  onRefresh: () => void;
}

const statusConfig: Record<string, { badge: string; dot: string; label: string }> = {
  scheduled:   { badge: "badge badge-cyan",   dot: "#14b8a6", label: "Scheduled" },
  in_progress: { badge: "badge badge-blue",   dot: "#3b82f6", label: "In Progress" },
  completed:   { badge: "badge badge-green",  dot: "#22c55e", label: "Completed" },
  cancelled:   { badge: "badge badge-red",    dot: "#ef4444", label: "Cancelled" },
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
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan shadow-[0_0_6px_rgba(20,184,166,0.5)]" />
          <h2 className="font-syne text-lg tracking-wide text-white">Job Queue</h2>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[72px] rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  const statusBorder: Record<string, string> = {
    scheduled: "border-left-cyan",
    in_progress: "border-left-blue",
    completed: "border-left-emerald",
    cancelled: "border-left-red",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan shadow-[0_0_6px_rgba(20,184,166,0.5)]" />
        <h2 className="font-syne text-lg tracking-wide text-white">Job Queue</h2>
      </div>
      <div className="space-y-2.5">
        {jobs.map((job) => {
          const cfg = statusConfig[job.status] ?? statusConfig.scheduled;
          return (
            <div
              key={job.id}
              className={`card px-4 py-3.5 flex items-center justify-between group ${statusBorder[job.status] ?? "border-left-cyan"}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}44` }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-plus text-sm font-medium text-gray-100 truncate">{job.customer}</span>
                    <span className={cfg.badge}>{cfg.label}</span>
                  </div>
                  <div className="font-dm-mono text-[11px] text-gray-600 mt-1">
                    {job.worker ?? "Unassigned"}
                    {job.scheduled_date && (
                      <>
                        ,&nbsp;
                        {new Date(job.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </>
                    )}
                  </div>
                  {job.tanks && job.tanks.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-2 space-y-0.5">
                      {job.tanks.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-[10px]">
                          <span>Tanks: <span className="text-gray-300">{t.count}</span></span>
                          <span>&middot;</span>
                          <span>Capacity: <span className="text-gray-300">{t.capacity_liters.toLocaleString()}L</span></span>
                          <span>&middot;</span>
                          <span className="text-cyan">{(t.count * t.capacity_liters).toLocaleString()}L total</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                {job.status === "scheduled" && (
                  <button
                    onClick={() => handleComplete(job)}
                    disabled={completing === job.id}
                    className="font-dm-mono text-[10px] font-medium px-3 py-1.5 rounded-md btn-cyan disabled:opacity-30 tracking-wider"
                  >
                    {completing === job.id ? "..." : "Complete"}
                  </button>
                )}
                {job.status === "completed" && (
                  <div className="flex flex-col items-end gap-1.5">
                    {job.completed_at && (
                      <div className="font-dm-mono text-[10px] text-gray-600 text-right leading-tight">
                        {new Date(job.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const msg = encodeURIComponent(
                          `Thank you for choosing CleanWater Solutions!\n\nWe'd love your feedback.\n\nGoogle Review:\nhttps://example.com/google-review\n\nJustDial Review:\nhttps://example.com/justdial-review`
                        );
                        window.open(`https://wa.me/${job.customer_phone?.replace("+", "")}?text=${msg}`, "_blank");
                      }}
                      className="font-dm-mono text-[10px] font-medium px-3 py-1.5 rounded-md btn-green tracking-wider"
                    >
                      Feedback
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {jobs.length === 0 && (
          <div className="card py-10 text-center">
            <p className="font-plus text-sm text-gray-600">No jobs yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
