export type JobStatus = 'pending' | 'in_progress' | 'completed';

export interface Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tank_capacity_liters: number;
  created_at: string;
}

export interface ServiceCard {
  id: string;
  customer_id: string;
  merchant_id: string;
  service_date: string;
  next_service_date: string | null;
  job_status: JobStatus;
  technician_id: string | null;
  notes: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  customers?: Customer;
  staff?: Staff;
}

export interface Staff {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  daily_wage_inr: number;
  is_active: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  staff_id: string;
  merchant_id: string;
  checkin_time: string | null;
  checkout_time: string | null;
  verified_location: boolean;
  date: string;
  notes: string | null;
  created_at: string;
  staff?: Staff;
}

export interface Inventory {
  id: string;
  merchant_id: string;
  item_name: string;
  unit: string;
  current_stock: number;
  minimum_threshold: number;
  created_at: string;
}

export interface InventoryTransaction {
  id: string;
  inventory_id: string;
  service_card_id: string;
  quantity_deducted: number;
  created_at: string;
}

export interface ServiceInventoryRequirement {
  id: string;
  service_type: string;
  item_name: string;
  quantity_per_1000L: number;
}

export interface StockAlert {
  id: string;
  inventory_id: string;
  merchant_id: string;
  alert_type: string;
  resolved: boolean;
  created_at: string;
  inventory?: Inventory;
}

export interface CronLog {
  id: string;
  type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  customer_phone: string;
  message: string;
  ai_response: string | null;
  requires_human_intervention: boolean;
  status: string;
  created_at: string;
}

export interface ServiceCardWithDetails extends Omit<ServiceCard, 'staff'> {
  customers: Customer;
  staff: Staff | null;
}

export interface AttendanceWithStaff extends Attendance {
  staff: Staff;
}
