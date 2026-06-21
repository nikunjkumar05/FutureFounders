export type JobStatus = 'pending' | 'in_progress' | 'completed';

export type ServiceType =
  | 'standard_cleaning'
  | 'deep_cleaning'
  | 'sofa_cleaning'
  | 'seats_cleaning'
  | 'carpet_cleaning'
  | 'custom_service';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  standard_cleaning: 'Tank Cleaning',
  deep_cleaning: 'Deep Cleaning',
  sofa_cleaning: 'Sofa Cleaning',
  seats_cleaning: 'Seats Cleaning',
  carpet_cleaning: 'Carpet Cleaning',
  custom_service: 'Custom Service',
};

// ─── Single-item detail types (backward compat) ──────────────────

export interface TankCleaningDetails {
  tankCount: number;
  tankCapacity: number;
  totalCapacity: number;
}

export interface DeepCleaningDetails {
  tankCount: number;
  tankCapacity: number;
  totalCapacity: number;
}

export interface SofaCleaningDetails {
  sofaCount: number;
  sofaType: string;
}

export interface SeatsCleaningDetails {
  seatCount: number;
}

export interface CarpetCleaningDetails {
  carpetArea: number;
  notes?: string;
}

export interface CustomServiceDetails {
  serviceName: string;
  notes?: string;
}

export type ServiceDetails =
  | TankCleaningDetails
  | DeepCleaningDetails
  | SofaCleaningDetails
  | SeatsCleaningDetails
  | CarpetCleaningDetails
  | CustomServiceDetails;

// ─── Multi-item types ────────────────────────────────────────────

export interface ServiceItem {
  id: string;
  quantity: number;
  price: number;
  capacity?: number;
  sofaType?: string;
  carpetArea?: number;
  serviceName?: string;
  notes?: string;
}

export interface ServiceGroup {
  serviceType: ServiceType;
  items: ServiceItem[];
  totalPrice: number;
}

export interface ServiceDetailsData {
  services: ServiceGroup[];
  totalCharge: number;
  tankCount?: number;
  tankCapacity?: number;
  totalCapacity?: number;
  sofaCount?: number;
  sofaType?: string;
  seatCount?: number;
  carpetArea?: number;
}

// ─── DB Models ───────────────────────────────────────────────────

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
  notes: string | null;
  created_at: string;
}

export interface ServiceCard {
  id: string;
  customer_id: string;
  merchant_id: string;
  service_type: ServiceType;
  service_details: Record<string, unknown>;
  service_date: string;
  next_service_date: string | null;
  job_status: JobStatus;
  technician_id: string | null;
  notes: string | null;
  feedback_sent: boolean;
  feedback_rating: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  customers?: Customer;
  staff?: Staff;
}

export type WageType = 'daily' | 'weekly' | 'monthly';

export const WAGE_TYPE_LABELS: Record<WageType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export interface Staff {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  daily_wage_inr: number;
  wage_type: WageType;
  wage_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface Advance {
  id: string;
  staff_id: string;
  merchant_id: string;
  amount: number;
  date: string;
  reason: string | null;
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

// ─── Daily Briefing ──────────────────────────────────────────────

export interface BriefingJob {
  id: string;
  customerName: string;
  customerAddress: string | null;
  serviceType: ServiceType;
  serviceTypeLabel: string;
  workerName: string | null;
  scheduledTime: string;
  status: JobStatus;
  readinessStatus: string;
}

export interface BriefingWorker {
  id: string;
  name: string;
  checkedIn: boolean;
  checkinTime: string | null;
}

export interface BriefingCustomerAlert {
  customerName: string;
  issue: string;
}

export interface BriefingInventoryAlert {
  itemName: string;
  remaining: string;
  threshold: string;
}

export interface BriefingReminder {
  customerName: string;
  serviceTypeLabel: string;
  dueDate: string;
}

export interface BriefingInsights {
  estimatedWorkload: string;
  customersToContact: number;
  potentialDelays: string[];
  inventoryRisks: string[];
}

export interface DailyBriefing {
  date: string;
  jobs: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    items: BriefingJob[];
  };
  workers: {
    totalActive: number;
    checkedIn: number;
    items: BriefingWorker[];
  };
  customerAlerts: BriefingCustomerAlert[];
  inventoryAlerts: BriefingInventoryAlert[];
  reminders: BriefingReminder[];
  openSupportTickets: number;
  insights: BriefingInsights;
}

// ─── Revenue Intelligence ────────────────────────────────────────

export type ReminderStatus = 'sent' | 'responded' | 'booked' | 'ignored';

export interface ReminderResponse {
  id: string;
  service_card_id: string;
  merchant_id: string;
  customer_id: string;
  sent_at: string;
  responded_at: string | null;
  response: string | null;
  status: ReminderStatus;
  notes: string | null;
  created_at: string;
}

export type CustomerSegment = 'ready_to_book' | 'follow_up_needed' | 'high_churn_risk' | 'unknown';

export interface CustomerIntelligence {
  id: string;
  merchant_id: string;
  customer_id: string;
  segment: CustomerSegment;
  estimated_revenue: number;
  last_reminder_response: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface SegmentedCustomer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  expectedValue: number;
  serviceType: string;
  serviceTypeLabel: string;
  status: string;
  daysOverdue: number;
  lastServiceDate: string | null;
}

export interface ReminderAnalytics {
  totalSent: number;
  responses: number;
  bookingsGenerated: number;
  conversionRate: number;
}

export interface RevenueIntelligence {
  potentialRevenueDueThisMonth: number;
  customersDue: number;
  respondedToReminder: number;
  awaitingFollowUp: number;
  highChurnRisk: number;
  potentialRevenueRecovery: number;
  segments: {
    readyToBook: SegmentedCustomer[];
    followUpNeeded: SegmentedCustomer[];
    highChurnRisk: SegmentedCustomer[];
  };
  reminderAnalytics: ReminderAnalytics;
  insights: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────

let _itemIdCounter = 0;
export function generateItemId(): string {
  return `item-${Date.now()}-${++_itemIdCounter}`;
}

export function isServiceDetailsData(details: Record<string, unknown>): boolean {
  return Array.isArray(details.services);
}

export function getServicesFromDetails(details: Record<string, unknown>): ServiceGroup[] {
  if (isServiceDetailsData(details)) {
    return details.services as ServiceGroup[];
  }
  const st = details.serviceType as ServiceType;
  if (!st) return [];
  const items: ServiceItem[] = [{
    id: generateItemId(),
    quantity: 1,
    price: 0,
    capacity: details.tankCapacity as number | undefined,
    sofaType: details.sofaType as string | undefined,
    carpetArea: details.carpetArea as number | undefined,
    serviceName: details.serviceName as string | undefined,
    notes: details.notes as string | undefined,
  }];
  return [{
    serviceType: st,
    items,
    totalPrice: 0,
  }];
}

export function getTotalCharge(details: Record<string, unknown>): number {
  if (isServiceDetailsData(details)) {
    return details.totalCharge as number;
  }
  return 0;
}

// ─── job_services DB row ─────────────────────────────────────────

export interface JobServiceRow {
  id: string;
  service_card_id: string;
  service_type: string;
  quantity: number;
  capacity_or_variant: string | null;
  price: number;
  notes: string | null;
  created_at: string;
}

// ─── Build service_details JSON from ServiceGroup[] ──────────────

export function buildServiceDetails(groups: ServiceGroup[]): Record<string, unknown> {
  const details: Record<string, unknown> = {
    services: groups.map(g => ({
      serviceType: g.serviceType,
      items: g.items,
      totalPrice: g.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    })),
    totalCharge: groups.reduce((sum, g) => sum + g.items.reduce((s, item) => s + (item.price * item.quantity), 0), 0),
  };

  const primary = groups[0];
  if (primary) {
    if (primary.serviceType === 'standard_cleaning' || primary.serviceType === 'deep_cleaning') {
      const totalCapacity = primary.items.reduce((sum, item) => sum + ((item.capacity ?? 1000) * (item.quantity ?? 1)), 0);
      const totalTanks = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
      details.tankCount = totalTanks;
      details.tankCapacity = totalTanks > 0 ? Math.round(totalCapacity / totalTanks) : 1000;
      details.totalCapacity = totalCapacity;
    } else if (primary.serviceType === 'sofa_cleaning') {
      details.sofaCount = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
      details.sofaType = primary.items[0]?.sofaType ?? 'Standard';
    } else if (primary.serviceType === 'seats_cleaning') {
      details.seatCount = primary.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    } else if (primary.serviceType === 'carpet_cleaning') {
      details.carpetArea = primary.items.reduce((sum, item) => sum + ((item.carpetArea ?? 0) * (item.quantity ?? 1)), 0);
    }
  }

  details.serviceType = primary?.serviceType ?? 'standard_cleaning';
  return details;
}

export function getGroupTotal(group: ServiceGroup): number {
  return group.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}
