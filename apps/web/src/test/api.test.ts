import { describe, it, expect, beforeEach } from "vitest";
import { getJobs, completeJob, getInventory, getReminders, sendReminder, getAttendance, manualCheckin, getMetrics } from "../api";
import { mockJobs, mockInventory, mockReminders, mockAttendance, mockMetrics, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api", () => {
  it("getJobs fetches and returns jobs", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    const jobs = await getJobs();
    expect(jobs).toEqual(mockJobs);
    expect(fetch).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    }));
  });

  it("completeJob sends POST with job id", async () => {
    const response = { id: mockJobs[0].id, status: "completed", completed_at: new Date().toISOString() };
    globalThis.fetch = mockFetch(response);
    const result = await completeJob(mockJobs[0].id);
    expect(result).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(`/api/jobs/${mockJobs[0].id}/complete`, expect.objectContaining({
      method: "POST",
    }));
  });

  it("getInventory fetches and returns inventory", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    const items = await getInventory();
    expect(items).toEqual(mockInventory);
  });

  it("getReminders fetches and returns reminders", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    const reminders = await getReminders();
    expect(reminders).toEqual(mockReminders);
  });

  it("sendReminder sends POST with reminder id", async () => {
    const response = { id: mockReminders[0].id, status: "sent", sent_at: new Date().toISOString() };
    globalThis.fetch = mockFetch(response);
    const result = await sendReminder(mockReminders[0].id);
    expect(result).toEqual(response);
  });

  it("getAttendance fetches and returns attendance", async () => {
    globalThis.fetch = mockFetch(mockAttendance);
    const attendance = await getAttendance();
    expect(attendance).toEqual(mockAttendance);
  });

  it("manualCheckin sends POST with worker_id and job_id", async () => {
    const response = { id: "ci-1", status: "on_time" };
    globalThis.fetch = mockFetch(response);
    const result = await manualCheckin("w-1", "job-1");
    expect(result).toEqual(response);
    expect(fetch).toHaveBeenCalledWith("/api/attendance/checkin", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ worker_id: "w-1", job_id: "job-1" }),
    }));
  });

  it("manualCheckin sends null job_id", async () => {
    const response = { id: "ci-2", status: "on_time" };
    globalThis.fetch = mockFetch(response);
    await manualCheckin("w-2", null);
    expect(fetch).toHaveBeenCalledWith("/api/attendance/checkin", expect.objectContaining({
      body: JSON.stringify({ worker_id: "w-2", job_id: null }),
    }));
  });

  it("getMetrics fetches and returns metrics", async () => {
    globalThis.fetch = mockFetch(mockMetrics);
    const metrics = await getMetrics();
    expect(metrics).toEqual(mockMetrics);
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = mockFetch("Not found", false, 404);
    await expect(getJobs()).rejects.toThrow("HTTP 404: Not found");
  });
});
