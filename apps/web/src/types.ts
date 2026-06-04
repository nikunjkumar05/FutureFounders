export interface Job {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_date: string | null;
  completed_at: string | null;
  site_lat: number | null;
  site_lng: number | null;
  customer: string;
  customer_phone: string;
  worker: string | null;
  tanks?: { capacity_liters: number; count: number }[] | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  min_threshold: string;
  low_stock: boolean;
}

export interface Metrics {
  completed_today: number;
  low_stock_count: number;
  reminders_due_soon: number;
}
