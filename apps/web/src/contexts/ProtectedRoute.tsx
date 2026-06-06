import { type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, role }: { children: ReactNode; role?: "customer" | "provider" }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06080f" }}>
        <div className="space-y-4 text-center">
          <div className="w-10 h-10 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin mx-auto" />
          <p className="font-dm-mono text-[10px] text-gray-500 tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    window.location.href = `/login${params.toString() ? "?" + params.toString() : ""}`;
    return null;
  }

  if (role && user.role !== role) {
    const redirect = user.role === "provider" ? "/dashboard" : "/";
    window.location.href = redirect;
    return null;
  }

  return <>{children}</>;
}
