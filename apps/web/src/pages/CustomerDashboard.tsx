import { useAuth } from "../contexts/AuthContext";

export default function CustomerDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen relative" style={{ background: "#06080f" }}>
      <header className="border-b border-white/[0.04] sticky top-0 z-40" style={{ background: "rgba(8,11,20,0.9)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#14b8a6">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
            </div>
            <div>
              <h1 className="font-syne text-lg tracking-wide text-white">MakeWebApp</h1>
              <p className="font-plus text-[10px] text-gray-500 tracking-wider">Customer Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              <span className="font-dm-mono text-[9px] text-gray-500 tracking-widest uppercase">{user?.name || "User"}</span>
            </div>
            <button onClick={logout} className="font-dm-mono text-[9px] text-gray-500 tracking-wider uppercase px-3 py-1.5 rounded-full hover:text-gray-300 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="text-center mb-12">
          <h2 className="font-syne text-3xl text-white mb-2">Welcome back, {user?.name?.split(" ")[0]}</h2>
          <p className="font-plus text-sm text-gray-500">Manage your services and requests</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h3 className="font-syne text-sm text-white mb-1">My Services</h3>
            <p className="font-plus text-xs text-gray-500">View your service history and upcoming appointments</p>
          </div>

          <div className="card p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="font-syne text-sm text-white mb-1">Book a Service</h3>
            <p className="font-plus text-xs text-gray-500">Schedule a new cleaning or maintenance service</p>
          </div>

          <div className="card p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="font-syne text-sm text-white mb-1">Support</h3>
            <p className="font-plus text-xs text-gray-500">Contact support or chat with our AI assistant</p>
          </div>
        </div>
      </main>
    </div>
  );
}
