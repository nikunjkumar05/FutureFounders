import { useCallback, useState, useEffect } from "react";
import MetricsBar from "./components/MetricsBar";
import JobList from "./components/JobList";
import ReminderQueue from "./components/ReminderQueue";
import AttendancePanel from "./components/AttendancePanel";
import InventoryPanel from "./components/InventoryPanel";
import AquaBot from "./components/AquaBot";
import { getJobs } from "./api";

export default function App() {
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
    <div className="min-h-screen" style={{ background: "#06080f" }}>
      {/* Ultra-thin progress bar */}
      <div className="sticky top-0 z-50" style={{ background: "#0c0f17", borderBottom: "1px solid #1a1d27" }}>
        <div className="max-w-7xl mx-auto px-6 py-1.5 flex items-center gap-3">
          <span className="font-dm-mono text-[10px] text-gray-500 tracking-[0.15em] uppercase">
            Today's completion
          </span>
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#1a1d27" }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #14b8a6, #14b8a6)",
              }}
            />
          </div>
          <span className="font-dm-mono text-[11px] text-gray-400">{progress}%</span>
        </div>
      </div>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #1a1d27", background: "#080b14" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-syne text-xl tracking-wide text-white">AquaOps</h1>
            <p className="font-plus text-[11px] text-gray-500 tracking-wide">Water Tank Cleaning Operations</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://wa.me/919999999991"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-plus text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors"
              style={{ background: "rgba(37,211,102,0.15)", color: "#25d366", border: "1px solid rgba(37,211,102,0.25)" }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#25d366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span>WhatsApp</span>
            </a>
            <span className="font-dm-mono text-[9px] text-gray-600 tracking-widest uppercase">Live &middot; v1.0</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <MetricsBar />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-6">
          {/* Jobs — 3 cols */}
          <div className="lg:col-span-3">
            <JobList refresh={refresh} onRefresh={triggerRefresh} />
            <ReminderQueue refresh={refresh} onRefresh={triggerRefresh} />
          </div>

          {/* Sidebar — 2 cols */}
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
