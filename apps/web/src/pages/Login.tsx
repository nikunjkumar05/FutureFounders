import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      const raw = localStorage.getItem("auth");
      let role: string | null = null;
      if (raw) {
        try { role = JSON.parse(raw).user?.role; } catch {}
      }
      window.location.href = role === "provider" ? "/dashboard" : "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#06080f" }}>
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#14b8a6">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <h1 className="font-syne text-xl text-white">MakeWebApp</h1>
          <p className="font-plus text-xs text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="font-plus text-xs text-red px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="font-dm-mono text-[10px] text-gray-500 tracking-wider uppercase block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full font-plus text-sm rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="font-dm-mono text-[10px] text-gray-500 tracking-wider uppercase block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full font-plus text-sm rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full font-dm-mono text-xs font-medium py-2.5 rounded-lg btn-cyan disabled:opacity-30 tracking-wider mt-2"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="font-plus text-xs text-gray-500 text-center mt-6">
          Don't have an account?{" "}
          <a href="/register" className="text-cyan no-underline hover:underline">Register</a>
        </p>
      </div>
    </div>
  );
}
