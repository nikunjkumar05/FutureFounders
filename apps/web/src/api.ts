import type { Job, InventoryItem, Metrics } from "./types";

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

export function getMetrics(): Promise<Metrics> {
  return fetchJson("/metrics");
}
