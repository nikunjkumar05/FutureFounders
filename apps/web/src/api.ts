import type { Job, InventoryItem, Reminder, WorkerAttendance, Metrics } from "./types";

const BASE = "/api";

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export function getJobs(): Promise<Job[]> {
  return fetchJson("/jobs");
}

export function completeJob(id: string): Promise<Job> {
  return fetchJson(`/jobs/${id}/complete`, { method: "POST" });
}

export function getInventory(): Promise<InventoryItem[]> {
  return fetchJson("/inventory");
}

export function getReminders(): Promise<Reminder[]> {
  return fetchJson("/reminders");
}

export function sendReminder(id: string): Promise<{ id: string; status: string; sent_at: string }> {
  return fetchJson(`/reminders/${id}/send`, { method: "POST" });
}

export function getAttendance(): Promise<WorkerAttendance[]> {
  return fetchJson("/attendance");
}

export function manualCheckin(workerId: string, jobId: string | null): Promise<{ id: string; status: string }> {
  return fetchJson("/attendance/checkin", {
    method: "POST",
    body: JSON.stringify({ worker_id: workerId, job_id: jobId }),
  });
}

export function getMetrics(): Promise<Metrics> {
  return fetchJson("/metrics");
}
