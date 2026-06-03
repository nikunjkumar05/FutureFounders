import type { Job, InventoryItem, Reminder, WorkerAttendance, Metrics } from "./types";

const BASE = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) throw new Error(await res.text());
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker_id: workerId, job_id: jobId }),
  });
}

export function getMetrics(): Promise<Metrics> {
  return fetchJson("/metrics");
}
