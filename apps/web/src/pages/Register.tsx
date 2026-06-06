import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "provider">("customer");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(email, password, name, role);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#06080f" }}>
        <div className="card w-full max-w-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green/10 border border-green/20 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="font-syne text-lg text-white mb-2">Account Created</h2>
          <p className="font-plus text-xs text-gray-400 mb-6">You can now sign in with your credentials.</p>
          <a href="/login" className="inline-block font-dm-mono text-xs font-medium px-5 py-2.5 rounded-lg btn-cyan no-underline tracking-wider">
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

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
          <p className="font-plus text-xs text-gray-500 mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="font-plus text-xs text-red px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="font-dm-mono text-[10px] text-gray-500 tracking-wider uppercase block mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full font-plus text-sm rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              placeholder="Your name"
            />
          </div>

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
              minLength={6}
              className="w-full font-plus text-sm rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-600 outline-none transition-all duration-200 focus:border-cyan/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="font-dm-mono text-[10px] text-gray-500 tracking-wider uppercase block mb-1.5">I am a</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole("customer")}
                className={`flex-1 font-plus text-xs py-2.5 rounded-lg transition-all duration-200 ${
                  role === "customer" ? "btn-cyan" : ""
                }`}
                style={role !== "customer" ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", cursor: "pointer" } : {}}
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => setRole("provider")}
                className={`flex-1 font-plus text-xs py-2.5 rounded-lg transition-all duration-200 ${
                  role === "provider" ? "btn-cyan" : ""
                }`}
                style={role !== "provider" ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", cursor: "pointer" } : {}}
              >
                Provider
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full font-dm-mono text-xs font-medium py-2.5 rounded-lg btn-cyan disabled:opacity-30 tracking-wider mt-2"
          >
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="font-plus text-xs text-gray-500 text-center mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-cyan no-underline hover:underline">Sign In</a>
        </p>
      </div>
    </div>
  );
}
