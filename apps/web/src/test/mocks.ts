import type { Job, InventoryItem, Reminder, WorkerAttendance, Metrics } from "../types";

export const mockJobs: Job[] = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    status: "scheduled",
    scheduled_date: "2026-06-10",
    completed_at: null,
    site_lat: 19.1136,
    site_lng: 72.8697,
    customer: "Sharma Residence",
    customer_phone: "+919999999994",
    worker: "Rajesh Kumar",
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    status: "completed",
    scheduled_date: "2026-06-05",
    completed_at: "2026-06-05T14:30:00Z",
    site_lat: 19.076,
    site_lng: 72.8777,
    customer: "Green Valley Apartments",
    customer_phone: "+919999999995",
    worker: "Amit Singh",
  },
];

export const mockInventory: InventoryItem[] = [
  { id: "inv-1", name: "Chlorine Solution", quantity: "50", unit: "litre", min_threshold: "5", low_stock: false },
  { id: "inv-2", name: "Anti-Bacterial Gel", quantity: "2", unit: "litre", min_threshold: "5", low_stock: true },
];

export const mockReminders: Reminder[] = [
  {
    id: "rem-1",
    due_date: "2026-06-01",
    status: "pending",
    sent_at: null,
    customer: "Sharma Residence",
    phone: "+919999999994",
    address: "Andheri West, Mumbai",
  },
  {
    id: "rem-2",
    due_date: "2026-07-01",
    status: "sent",
    sent_at: "2026-06-01T08:00:00Z",
    customer: "Green Valley Apartments",
    phone: "+919999999995",
    address: "Bandra East, Mumbai",
  },
];

export const mockAttendance: WorkerAttendance[] = [
  {
    id: "w-1",
    name: "Rajesh Kumar",
    phone: "+919999999992",
    job_id: "20000000-0000-0000-0000-000000000001",
    job_status: "in_progress",
    customer: "Sharma Residence",
    check_in_status: "on_time",
    distance_meters: "15",
    checked_in_at: "2026-06-06T08:05:00Z",
  },
  {
    id: "w-2",
    name: "Amit Singh",
    phone: "+919999999993",
    job_id: null,
    job_status: null,
    customer: null,
    check_in_status: null,
    distance_meters: null,
    checked_in_at: null,
  },
];

export const mockMetrics: Metrics = {
  completed_today: 3,
  low_stock_count: 1,
  reminders_due_soon: 2,
};

export function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? status : 404,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(ok ? JSON.stringify(data) : "Not found"),
  });
}
