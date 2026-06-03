import { useCallback, useState, useEffect } from "react";
import MetricsBar from "./components/MetricsBar";
import JobList from "./components/JobList";
import InventoryPanel from "./components/InventoryPanel";
import AquaBot from "./components/AquaBot";
import WhatsAppButton from "./components/WhatsAppButton";
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
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #050811, #0A0F1C)" }}>
      {/* Sticky progress bar */}
      <div className="sticky top-0 z-50 glass border-b border-glass-border">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-4">
          <span className="font-dm-mono text-xs text-gray-400 tracking-widest uppercase">
            Today's completion
          </span>
          <div className="flex-1 h-2 bg-navy-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #4F8EF7, #14b8a6)",
              }}
            />
          </div>
          <span className="font-dm-mono text-sm text-gray-300 font-medium">{progress}%</span>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-glass-border" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="font-syne text-2xl tracking-tight text-white">AquaOps</h1>
            <p className="font-plus text-xs text-gray-500 tracking-wide">Water Tank Cleaning Operations</p>
          </div>
          <div className="flex items-center gap-4">
            <WhatsAppButton />
            <span className="font-dm-mono text-[10px] text-gray-600 tracking-widest uppercase">Live &middot; v1.0</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <MetricsBar />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
          {/* Jobs — 3 cols */}
          <div className="lg:col-span-3">
            <JobList refresh={refresh} onRefresh={triggerRefresh} />
          </div>

          {/* Sidebar — 2 cols */}
          <div className="lg:col-span-2 space-y-5">
            <InventoryPanel refresh={refresh} />
            <AquaBot />
          </div>
        </div>
      </main>
    </div>
  );
}
