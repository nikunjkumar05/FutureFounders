import { useCallback, useState, useEffect } from "react";
import MetricsBar from "../components/MetricsBar";
import JobList from "../components/JobList";
import ReminderQueue from "../components/ReminderQueue";
import AttendancePanel from "../components/AttendancePanel";
import InventoryPanel from "../components/InventoryPanel";
import AquaBot from "../components/AquaBot";
import { getJobs } from "../api";
import { useAuth } from "../contexts/AuthContext";

export default function ProviderDashboard() {
  const { user, logout } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [progress, setProgress] = useState(0);
  const triggerRefresh = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    getJobs().then((jobs) => {
      const total = jobs.length;
      const done = jobs.filter((j) => j.status === "completed").length;
      setProgress(total > 0 ? Math.round((done / total) * 100) : 0);
    });
  }, [refresh]);

  return (
    <div className="min-h-screen relative" style={{ background: "#06080f" }}>
      {/* Ultra-thin progress bar */}
      <div className="sticky top-0 z-50 glass border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan shadow-[0_0_6px_rgba(20,184,166,0.5)]" />
            <span className="font-dm-mono text-[10px] text-gray-500 tracking-[0.15em] uppercase">Completion</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #14b8a6, #0d9488)",
                boxShadow: progress > 0 ? "0 0 8px rgba(20,184,166,0.3)" : "none",
              }}
            />
          </div>
          <span className="font-dm-mono text-[11px] text-gray-400 min-w-[3ch] text-right">{progress}%</span>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.04] sticky top-[33px] z-40" style={{ background: "rgba(8,11,20,0.9)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#14b8a6">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <div>
              <h1 className="font-syne text-lg tracking-wide text-white">MakeWebApp</h1>
              <p className="font-plus text-[10px] text-gray-500 tracking-wider">Operations Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              <span className="font-dm-mono text-[9px] text-gray-500 tracking-widest uppercase">{user?.name || "Provider"}</span>
            </div>
            <button onClick={logout} className="font-dm-mono text-[9px] text-gray-500 tracking-wider uppercase px-3 py-1.5 rounded-full hover:text-gray-300 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <MetricsBar />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-6">
          <div className="lg:col-span-3">
            <JobList refresh={refresh} onRefresh={triggerRefresh} />
            <ReminderQueue refresh={refresh} onRefresh={triggerRefresh} />
          </div>

          <div className="lg:col-span-2 space-y-5">
            <AttendancePanel refresh={refresh} onRefresh={triggerRefresh} />
            <InventoryPanel refresh={refresh} />
            <AquaBot />
          </div>
        </div>
      </main>
    </div>
  );
}
