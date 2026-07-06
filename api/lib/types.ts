// Self-contained types for api/ (no src/ imports)

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

export type WageType = 'daily' | 'weekly' | 'monthly';

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
  discount: number;
  notes: string | null;
  feedback_sent: boolean;
  feedback_rating: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  customers?: Customer;
  staff?: Staff;
}

export interface ServiceCardWithDetails extends Omit<ServiceCard, 'staff'> {
  customers: Customer;
  staff: Staff | null;
}

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

export type CustomerSegment = 'not_due' | 'ready_to_book' | 'follow_up_needed' | 'high_churn_risk' | 'scheduled' | 'unknown';

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
  healthScore: number;
  anchorCardId?: string;
}
