import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User, AuthState } from "../types";

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: "customer" | "provider") => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStored(): AuthState {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return { user: null, token: null, loading: true };
    const parsed = JSON.parse(raw);
    return { user: parsed.user ?? null, token: parsed.token ?? null, loading: false };
  } catch {
    return { user: null, token: null, loading: true };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getStored);

  useEffect(() => {
    if (state.token) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${state.token}` },
      })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((user) => {
          setState({ user, token: state.token, loading: false });
          localStorage.setItem("auth", JSON.stringify({ user, token: state.token }));
        })
        .catch(() => {
          setState({ user: null, token: null, loading: false });
          localStorage.removeItem("auth");
        });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }
    const { token, user } = await res.json();
    const payload = { user, token };
    setState({ ...payload, loading: false });
    localStorage.setItem("auth", JSON.stringify(payload));
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: "customer" | "provider") => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }
  }, []);

  const logout = useCallback(() => {
    setState({ user: null, token: null, loading: false });
    localStorage.removeItem("auth");
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
