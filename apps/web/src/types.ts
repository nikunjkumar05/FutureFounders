export interface Job {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_date: string | null;
  completed_at: string | null;
  site_lat: number | null;
  site_lng: number | null;
  customer: string;
  worker: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  min_threshold: string;
  low_stock: boolean;
}

export interface Reminder {
  id: string;
  due_date: string;
  status: "pending" | "sent" | "converted" | "failed";
  sent_at: string | null;
  customer: string;
  phone: string;
  address: string | null;
}

export interface WorkerAttendance {
  id: string;
  name: string;
  phone: string;
  job_id: string | null;
  job_status: string | null;
  customer: string | null;
  check_in_status: string | null;
  distance_meters: string | null;
  checked_in_at: string | null;
}

export interface Metrics {
  completed_today: number;
  low_stock_count: number;
  reminders_due_soon: number;
}
