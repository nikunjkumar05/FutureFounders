import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  Customer,
  DuplicateCheckResult,
  ServiceCardWithDetails,
  Staff,
  Attendance,
  AttendanceWithStaff,
  Advance,
  Inventory,
  StockAlert,
  SupportTicket,
  JobStatus,
  ServiceType,
  ServiceGroup,
  DailyBriefing,
  BriefingJob,
  BriefingWorker,
  BriefingCustomerAlert,
  BriefingInventoryAlert,
  BriefingReminder,
  BriefingInsights,
  ReminderResponse,
  CustomerSegment,
  RevenueIntelligence,
  SegmentedCustomer,
  ReminderStatus,
  WageType,
} from './types';
import { SERVICE_TYPE_LABELS } from './types';
import { estimateServiceValue } from './customer-intelligence';
import { evaluateCustomerAttentionBatch } from './customer-attention-pipeline';
import type { CustomerAttentionResult } from './customer-attention-pipeline';
import { refreshCustomerIntelligence as refreshCI } from './customer-intelligence-sync';
import { trackEvent } from './analytics';

export const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// Customers
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('merchant_id', MERCHANT_ID)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });
}

// Service Cards with details
export function useServiceCards(status?: JobStatus) {
  return useQuery({
    queryKey: ['service_cards', status],
    queryFn: async () => {
      let q = supabase
        .from('service_cards')
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at, customers(*), staff(*)')
        .eq('merchant_id', MERCHANT_ID)
        .order('service_date', { ascending: false });
      if (status) q = q.eq('job_status', status);
      const { data, error } = await q;
      if (error) {
        console.error('[useServiceCards] Query error:', JSON.stringify(error, null, 2));
        throw error;
      }
      console.log('[useServiceCards] Fetched', data?.length, 'cards');
      return data as unknown as ServiceCardWithDetails[];
    },
  });
}

export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const updates: Record<string, unknown> = { job_status: status };
      if (status === 'completed') {
        const { data: card, error: fetchError } = await supabase
          .from('service_cards')
          .select('service_date')
          .eq('id', id)
          .single();
        if (fetchError) throw fetchError;
        if (!card) throw new Error('Service card not found');
        if (!card.service_date) throw new Error('Service card is missing service date');
        const nextDate = new Date(
          new Date(card.service_date).getTime() + 180 * 86400000
        ).toISOString().slice(0, 10);
        updates.next_service_date = nextDate;
      }
      const { data, error } = await supabase
        .from('service_cards')
        .update(updates)
        .eq('id', id)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      if (variables.status === 'completed') {
        trackEvent('job_completed', { job_id: variables.id });
        refreshCustomerIntelligence(data.customer_id);
      }
    },
  });
}

// Create job
export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: {
      customerId: string;
      serviceType: ServiceType;
      serviceDetails: Record<string, unknown>;
      serviceDate: string;
      technicianId?: string;
      notes?: string;
      services?: ServiceGroup[];
    }) => {
      const nextDate = new Date(
        new Date(job.serviceDate).getTime() + 180 * 86400000
      ).toISOString().slice(0, 10);

      const payload: Record<string, unknown> = {
        customer_id: job.customerId,
        merchant_id: MERCHANT_ID,
        service_type: job.serviceType,
        service_details: job.serviceDetails,
        service_date: job.serviceDate,
        next_service_date: nextDate,
        technician_id: job.technicianId ?? null,
        notes: job.notes ?? null,
      };

      console.log('[useCreateJob] Inserting:', JSON.stringify(payload, null, 2));
      const { data, error } = await supabase
        .from('service_cards')
        .insert(payload)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) {
        console.error('[useCreateJob] Insert error:', JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Failed to create job in database');
      }
      console.log('[useCreateJob] Inserted card:', data);

      const card = data as Record<string, unknown>;
      const cardId = card.id as string;

      if (job.services && job.services.length > 0) {
        const jobServiceRows = job.services.flatMap(g =>
          g.items.map(item => ({
            service_card_id: cardId,
            service_type: g.serviceType,
            quantity: item.quantity,
            capacity_or_variant: item.capacity != null ? String(item.capacity) : item.sofaType ?? item.serviceName ?? null,
            price: item.price,
            notes: item.notes ?? null,
          }))
        );
        console.log('[useCreateJob] Inserting job_services:', jobServiceRows.length, 'rows');
        const { error: jsErr } = await supabase.from('job_services').insert(jobServiceRows);
        if (jsErr) {
          console.error('[useCreateJob] job_services error:', JSON.stringify(jsErr, null, 2));
          await supabase.from('service_cards').delete().eq('id', cardId);
          throw new Error('Failed to save service details: ' + jsErr.message);
        }
      }

      return data;
    },
    onSuccess: (data, variables) => {
      console.log('[useCreateJob] onSuccess - invalidating queries');
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      const card = data as Record<string, unknown>;
      const serviceCount = variables.services?.length ?? 1;
      const totalAmount = variables.services?.reduce(
        (sum, g) => sum + g.items.reduce((s, item) => s + (item.price * item.quantity), 0), 0
      ) ?? 0;
      trackEvent('job_created', {
        job_id: card.id as string,
        customer_id: variables.customerId,
        service_count: serviceCount,
        total_amount: totalAmount,
      });
    },
  });
}

// Staff
export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('merchant_id', MERCHANT_ID)
        .eq('is_active', true);
      if (error) throw error;
      return data as Staff[];
    },
  });
}

// Attendance
export function useAttendance(date?: string) {
  return useQuery({
    queryKey: ['attendance', date],
    queryFn: async () => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('attendance')
        .select('*, staff(*)')
        .eq('merchant_id', MERCHANT_ID)
        .eq('date', d)
        .order('checkin_time', { ascending: true });
      if (error) throw error;
      return data as AttendanceWithStaff[];
    },
  });
}

export function useManualCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      staffId,
      notes,
      date,
    }: {
      staffId: string;
      notes?: string;
      date: string;
    }) => {
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          staff_id: staffId,
          merchant_id: MERCHANT_ID,
          checkin_time: new Date().toISOString(),
          verified_location: false,
          date,
          notes: notes ?? 'Manual check-in',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['monthly_attendance'] });
    },
  });
}

export function useManualCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attendanceId }: { attendanceId: string }) => {
      const { data, error } = await supabase
        .from('attendance')
        .update({ checkout_time: new Date().toISOString() })
        .eq('id', attendanceId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['monthly_attendance'] });
    },
  });
}

// Inventory
export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('merchant_id', MERCHANT_ID)
        .order('item_name');
      if (error) throw error;
      return data as Inventory[];
    },
  });
}

export function useStockAlerts() {
  return useQuery({
    queryKey: ['stock_alerts'],
    queryFn: async () => {
      const [alertsResult, allAlertsResult, inventoryResult] = await Promise.all([
        supabase
          .from('stock_alerts')
          .select('*, inventory(*)')
          .eq('merchant_id', MERCHANT_ID)
          .eq('resolved', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('stock_alerts')
          .select('inventory_id')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('inventory')
          .select('*')
          .eq('merchant_id', MERCHANT_ID),
      ]);

      const alerts = alertsResult.data;
      const allAlerts = allAlertsResult.data;
      const inventory = inventoryResult.data;

      const alertIds = new Set((allAlerts ?? []).map(a => a.inventory_id));
      const belowThreshold = (inventory ?? []).filter(
        i => i.current_stock < i.minimum_threshold && !alertIds.has(i.id)
      );

      const combined: StockAlert[] = [
        ...(alerts ?? []),
        ...belowThreshold.map(i => ({
          id: `inventory-${i.id}`,
          inventory_id: i.id,
          merchant_id: i.merchant_id,
          alert_type: 'low_stock' as const,
          resolved: false,
          created_at: new Date().toISOString(),
          inventory: i,
        })),
      ];

      return combined;
    },
    refetchInterval: 30_000,
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ alertId, inventoryId, merchantId }: { alertId: string; inventoryId?: string; merchantId?: string }) => {
      if (alertId.startsWith('inventory-')) {
        const { error } = await supabase
          .from('stock_alerts')
          .insert({
            inventory_id: inventoryId,
            merchant_id: merchantId,
            alert_type: 'low_stock',
            resolved: true,
          });
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('stock_alerts')
          .update({ resolved: true })
          .eq('id', alertId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_alerts'] });
      qc.invalidateQueries({ queryKey: ['stock_alerts', 'resolved'] });
    },
  });
}

export function useResolvedAlerts() {
  return useQuery({
    queryKey: ['stock_alerts', 'resolved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_alerts')
        .select('inventory_id')
        .eq('merchant_id', MERCHANT_ID)
        .eq('resolved', true);
      if (error) throw error;
      return new Set((data ?? []).map(a => a.inventory_id));
    },
  });
}

// Support Tickets
export function useSupportTickets() {
  return useQuery({
    queryKey: ['support_tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('merchant_id', MERCHANT_ID)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
  });
}

export function useResolveTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const { data, error } = await supabase.functions.invoke('resolve-ticket', {
        body: { ticketId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support_tickets'] }),
  });
}

// Reminder
export function useMarkReminderSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      const { data, error } = await supabase
        .from('service_cards')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', cardId)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
  });
}

// Time saved metrics (current calendar month)
export function useTimeSavedMetrics() {
  return useQuery({
    queryKey: ['time_saved_metrics'],
    queryFn: async () => {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [completedJobs, remindersSent, reminderResponses, customersCreated, attendanceCheckIns] = await Promise.all([
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('job_status', 'completed')
          .gte('service_date', monthStart)
          .lte('service_date', monthEnd),
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .not('reminder_sent_at', 'is', null)
          .gte('reminder_sent_at', monthStart)
          .lte('reminder_sent_at', monthEnd),
        supabase
          .from('reminder_responses')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .not('responded_at', 'is', null)
          .gte('responded_at', monthStart)
          .lte('responded_at', monthEnd),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd),
        supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .not('checkin_time', 'is', null)
          .gte('checkin_time', monthStart)
          .lte('checkin_time', monthEnd),
      ]);

      return {
        completedJobs: completedJobs.count ?? 0,
        remindersSent: remindersSent.count ?? 0,
        reminderResponses: reminderResponses.count ?? 0,
        customersCreated: customersCreated.count ?? 0,
        attendanceCheckIns: attendanceCheckIns.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

// Dashboard metrics
export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const [pending, inProgress, completed, stockAlerts, inventory, attendance, cardsRes, remindersRes] = await Promise.all([
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('job_status', 'pending'),
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('job_status', 'in_progress'),
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('job_status', 'completed')
          .gte('service_date', weekAgo),
        supabase
          .from('stock_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('resolved', false),
        supabase
          .from('inventory')
          .select('id, current_stock, minimum_threshold')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('date', today)
          .not('checkin_time', 'is', null),
        supabase
          .from('service_cards')
          .select('*, customers(*), staff(*)')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('reminder_responses')
          .select('*')
          .eq('merchant_id', MERCHANT_ID),
      ]);

      const unresolvedAlerts = stockAlerts.count ?? 0;
      const belowThreshold = (inventory.data ?? []).filter(
        (i: { current_stock: number; minimum_threshold: number }) => i.current_stock < i.minimum_threshold
      ).length;

      // Derive reminder-eligible count from canonical pipeline
      const cards = (cardsRes.data ?? []) as unknown as ServiceCardWithDetails[];
      const reminderResponses = (remindersRes.data ?? []) as ReminderResponse[];
      const customerIds = [...new Set(cards.map(c => c.customer_id))];
      const pipelineResults = customerIds.length > 0
        ? evaluateCustomerAttentionBatch({
            serviceCards: cards,
            reminders: reminderResponses,
            customerId: customerIds[0],
            merchantId: MERCHANT_ID,
            today: new Date(),
          }, customerIds)
        : new Map<string, CustomerAttentionResult>();
      const dueReminders = [...pipelineResults.values()].filter(r => r.reminderEligible).length;

      return {
        pendingJobs: pending.count ?? 0,
        inProgressJobs: inProgress.count ?? 0,
        jobsCompletedThisWeek: completed.count ?? 0,
        dueReminders,
        lowStockAlerts: unresolvedAlerts + belowThreshold,
        staffCheckedIn: attendance.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

// Monthly attendance for wage calculation
export function useMonthlyAttendance(staffId: string, month: string) {
  return useQuery({
    queryKey: ['monthly_attendance', staffId, month],
    queryFn: async () => {
      const [year, mon] = month.split('-').map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('attendance')
        .select('id, date, checkin_time, checkout_time')
        .eq('staff_id', staffId)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('checkin_time', 'is', null);
      if (error) throw error;
      return data;
    },
    enabled: !!staffId && !!month,
  });
}

// Monthly attendance export (all staff)
export function useMonthlyAttendanceExport(month: string) {
  return useQuery({
    queryKey: ['monthly_attendance_export', month],
    queryFn: async () => {
      const [year, mon] = month.split('-').map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('attendance')
        .select('*, staff(name, daily_wage_inr, wage_type, wage_amount)')
        .eq('merchant_id', MERCHANT_ID)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      if (error) throw error;
      return data as (Attendance & { staff: Pick<Staff, 'name' | 'daily_wage_inr' | 'wage_type' | 'wage_amount'> })[];
    },
    enabled: !!month,
  });
}

export async function checkDuplicateCustomer({
  name,
  phone,
  excludeId,
}: {
  name: string;
  phone: string;
  excludeId?: string;
}): Promise<DuplicateCheckResult | null> {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();

  let phoneQuery = supabase
    .from('customers')
    .select('*')
    .eq('merchant_id', MERCHANT_ID)
    .eq('phone', trimmedPhone);

  if (excludeId) {
    phoneQuery = phoneQuery.neq('id', excludeId);
  }

  const { data: phoneMatches, error: phoneErr } = await phoneQuery;
  if (phoneErr) throw phoneErr;

  if (phoneMatches && phoneMatches.length > 0) {
    for (const existing of phoneMatches) {
      const c = existing as Customer;
      if (c.name.trim().toLowerCase() === trimmedName.toLowerCase()) {
        return { type: 'exact', customer: c };
      }
    }
    return { type: 'phone_only', customer: phoneMatches[0] as Customer };
  }

  let nameQuery = supabase
    .from('customers')
    .select('*')
    .eq('merchant_id', MERCHANT_ID)
    .ilike('name', trimmedName);

  if (excludeId) {
    nameQuery = nameQuery.neq('id', excludeId);
  }

  const { data: nameMatches, error: nameErr } = await nameQuery;
  if (nameErr) throw nameErr;

  if (nameMatches && nameMatches.length > 0) {
    return { type: 'name_only', customer: nameMatches[0] as Customer };
  }

  return null;
}

// Add customer
export function useAddCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: {
      name: string;
      phone: string;
      address?: string | null;
      notes?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          merchant_id: MERCHANT_ID,
          name: customer.name,
          phone: customer.phone,
          address: customer.address ?? null,
          notes: customer.notes ?? null,
          latitude: customer.latitude ?? null,
          longitude: customer.longitude ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      const c = data as Record<string, unknown>;
      trackEvent('customer_created', { customer_id: c.id as string });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: {
      id: string;
      name: string;
      phone: string;
      address?: string | null;
      notes?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .update({
          name: customer.name,
          phone: customer.phone,
          address: customer.address ?? null,
          notes: customer.notes ?? null,
          latitude: customer.latitude ?? null,
          longitude: customer.longitude ?? null,
        })
        .eq('id', customer.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      trackEvent('customer_updated', { customer_id: variables.id });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      trackEvent('customer_deleted', { customer_id: variables.id });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: {
      id: string;
      customerId: string;
      serviceType: ServiceType;
      serviceDetails: Record<string, unknown>;
      serviceDate: string;
      technicianId?: string;
      notes?: string;
      services?: ServiceGroup[];
      discount?: number;
    }) => {
      const nextDate = new Date(
        new Date(job.serviceDate).getTime() + 180 * 86400000
      ).toISOString().slice(0, 10);

      const payload: Record<string, unknown> = {
        customer_id: job.customerId,
        service_type: job.serviceType,
        service_details: job.serviceDetails,
        service_date: job.serviceDate,
        next_service_date: nextDate,
        technician_id: job.technicianId ?? null,
        notes: job.notes ?? null,
        discount: job.discount ?? 0,
      };

      const { data, error } = await supabase
        .from('service_cards')
        .update(payload)
        .eq('id', job.id)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) {
        console.error('Update job error:', error);
        throw new Error(error.message || 'Failed to update job');
      }

      if (job.services && job.services.length > 0) {
        const { error: delErr } = await supabase
          .from('job_services')
          .delete()
          .eq('service_card_id', job.id);
        if (delErr) throw new Error('Failed to remove old service details: ' + delErr.message);

        const jobServiceRows = job.services.flatMap(g =>
          g.items.map(item => ({
            service_card_id: job.id,
            service_type: g.serviceType,
            quantity: item.quantity,
            capacity_or_variant: item.capacity != null ? String(item.capacity) : item.sofaType ?? item.serviceName ?? null,
            price: item.price,
            notes: item.notes ?? null,
          }))
        );
        if (jobServiceRows.length > 0) {
          const { error: insErr } = await supabase.from('job_services').insert(jobServiceRows);
          if (insErr) throw new Error('Failed to save service details: ' + insErr.message);
        }
      }

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      trackEvent('job_updated', { job_id: variables.id });
      if (variables.discount !== undefined) {
        trackEvent('job_discount_updated', { job_id: variables.id, discount: variables.discount });
      }
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('service_cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      trackEvent('job_deleted', { job_id: variables.id });
    },
  });
}

// Staff management
export function useAddStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { name: string; phone: string; wageType: WageType; wageAmount: number }) => {
      const { data, error } = await supabase
        .from('staff')
        .insert({
          merchant_id: MERCHANT_ID,
          name: s.name,
          phone: s.phone,
          wage_type: s.wageType,
          wage_amount: s.wageAmount,
          daily_wage_inr: s.wageType === 'daily' ? s.wageAmount : 0,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      const s = data as Record<string, unknown>;
      trackEvent('worker_created', { worker_id: s.id as string });
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { id: string; name: string; phone: string; wageType: WageType; wageAmount: number; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('staff')
        .update({
          name: s.name,
          phone: s.phone,
          wage_type: s.wageType,
          wage_amount: s.wageAmount,
          daily_wage_inr: s.wageType === 'daily' ? s.wageAmount : 0,
          is_active: s.isActive,
        })
        .eq('id', s.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      trackEvent('worker_updated', { worker_id: variables.id });
    },
  });
}

// Advances
export function useAdvances(staffId: string) {
  return useQuery({
    queryKey: ['advances', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('advances')
        .select('*')
        .eq('staff_id', staffId)
        .eq('merchant_id', MERCHANT_ID)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Advance[];
    },
    enabled: !!staffId,
  });
}

export function useStaffMonthlyAdvances(staffId: string, month: string) {
  return useQuery({
    queryKey: ['advances_monthly', staffId, month],
    queryFn: async () => {
      const [year, mon] = month.split('-').map(Number);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('advances')
        .select('*')
        .eq('staff_id', staffId)
        .eq('merchant_id', MERCHANT_ID)
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) throw error;
      return data as Advance[];
    },
    enabled: !!staffId && !!month,
  });
}

export function useAddAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adv: { staffId: string; amount: number; date: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('advances')
        .insert({
          staff_id: adv.staffId,
          merchant_id: MERCHANT_ID,
          amount: adv.amount,
          date: adv.date,
          reason: adv.reason ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advances', variables.staffId] });
      qc.invalidateQueries({ queryKey: ['advances_monthly', variables.staffId] });
      trackEvent('advance_paid', {
        worker_id: variables.staffId,
        advance_amount: variables.amount,
      });
    },
  });
}

export function useUpdateAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adv: { id: string; staffId: string; amount: number; date: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('advances')
        .update({
          amount: adv.amount,
          date: adv.date,
          reason: adv.reason ?? null,
        })
        .eq('id', adv.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advances', variables.staffId] });
      qc.invalidateQueries({ queryKey: ['advances_monthly', variables.staffId] });
    },
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId: _staffId }: { id: string; staffId: string }) => {
      const { error } = await supabase.from('advances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advances', variables.staffId] });
      qc.invalidateQueries({ queryKey: ['advances_monthly', variables.staffId] });
    },
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      trackEvent('worker_deleted', { worker_id: variables.id });
    },
  });
}

// Add inventory item
export function useAddInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      itemName: string;
      unit: string;
      currentStock: number;
      minimumThreshold: number;
    }) => {
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          merchant_id: MERCHANT_ID,
          item_name: item.itemName,
          unit: item.unit,
          current_stock: item.currentStock,
          minimum_threshold: item.minimumThreshold,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      const item = data as Record<string, unknown>;
      trackEvent('inventory_item_added', { item_id: item.id as string, quantity: item.current_stock as number });
    },
  });
}

export function useUpdateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      id: string;
      itemName: string;
      unit: string;
      currentStock: number;
      minimumThreshold: number;
    }) => {
      const { data, error } = await supabase
        .from('inventory')
        .update({
          item_name: item.itemName,
          unit: item.unit,
          current_stock: item.currentStock,
          minimum_threshold: item.minimumThreshold,
        })
        .eq('id', item.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      trackEvent('inventory_item_updated', { item_id: variables.id });
    },
  });
}

export function useDeleteInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      trackEvent('inventory_item_deleted', { item_id: variables.id });
    },
  });
}

// Feedback
// Daily Briefing
export function useDailyBriefing() {
  return useQuery({
    queryKey: ['daily_briefing'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [
        cardsRes,
        staffRes,
        attendanceRes,
        inventoryRes,
        stockAlertsRes,
        remindersPipelineRes,
        ticketsRes,
      ] = await Promise.all([
        supabase
          .from('service_cards')
          .select('*, customers(*), staff(*)')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('staff')
          .select('*')
          .eq('merchant_id', MERCHANT_ID)
          .eq('is_active', true),
        supabase
          .from('attendance')
          .select('*, staff(*)')
          .eq('merchant_id', MERCHANT_ID)
          .eq('date', today)
          .not('checkin_time', 'is', null),
        supabase
          .from('inventory')
          .select('*')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('stock_alerts')
          .select('*, inventory(*)')
          .eq('merchant_id', MERCHANT_ID)
          .eq('resolved', false),
        supabase
          .from('reminder_responses')
          .select('*')
          .eq('merchant_id', MERCHANT_ID),
        supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
      ]);

      const allCards = (cardsRes.data ?? []) as unknown as ServiceCardWithDetails[];
      const staffList = (staffRes.data ?? []) as Staff[];
      const attendanceRecords = (attendanceRes.data ?? []) as AttendanceWithStaff[];
      const inventoryItems = (inventoryRes.data ?? []) as Inventory[];
      const stockAlerts = stockAlertsRes.data ?? [];
      const reminders = (remindersPipelineRes.data ?? []) as ReminderResponse[];
      const openTickets = ticketsRes.count ?? 0;

      // Filter for today's jobs
      const serviceCards = allCards.filter(c => c.service_date === today);

      // Derive reminders from canonical pipeline
      const customerIds = [...new Set(allCards.map(c => c.customer_id))];
      const pipelineResults = customerIds.length > 0
        ? evaluateCustomerAttentionBatch({
            serviceCards: allCards,
            reminders,
            customerId: customerIds[0],
            merchantId: MERCHANT_ID,
            today: new Date(),
          }, customerIds)
        : new Map<string, CustomerAttentionResult>();

      const cardById = new Map(allCards.map(c => [c.id, c]));
      const remindersBriefing: BriefingReminder[] = [];
      for (const [, result] of pipelineResults) {
        if (result.reminderEligible) {
          const anchorCard = cardById.get(result.lifecycleAnchorId);
          remindersBriefing.push({
            customerName: result.customerName,
            serviceTypeLabel: anchorCard
              ? (SERVICE_TYPE_LABELS[anchorCard.service_type] ?? anchorCard.service_type)
              : 'Unknown',
            dueDate: result.nextServiceDate ?? 'N/A',
          });
        }
      }

      const checkedInStaffIds = new Set(attendanceRecords.map(a => a.staff_id));

      const jobs: BriefingJob[] = serviceCards.map(card => {
        const details = (card.service_details ?? {}) as Record<string, unknown>;
        const services = Array.isArray(details.services) ? details.services : [];
        const label = services.length > 1
          ? `${services.length} services`
          : (SERVICE_TYPE_LABELS[card.service_type] ?? card.service_type);
        return {
          id: card.id,
          customerName: card.customers?.name ?? 'Unknown',
          customerAddress: card.customers?.address ?? null,
          serviceType: card.service_type,
          serviceTypeLabel: label,
          workerName: card.staff?.name ?? null,
          scheduledTime: card.service_date,
          status: card.job_status,
          readinessStatus: 'N/A',
        };
      });

      const workers: BriefingWorker[] = staffList.map(s => ({
        id: s.id,
        name: s.name,
        checkedIn: checkedInStaffIds.has(s.id),
        checkinTime: attendanceRecords.find(a => a.staff_id === s.id)?.checkin_time ?? null,
      }));

      const customerAlerts: BriefingCustomerAlert[] = [];

      const inventoryAlerts: BriefingInventoryAlert[] = [];

      const alertedInventoryIds = new Set(
        stockAlerts.map((a: Record<string, unknown>) => a.inventory_id as string)
      );

      for (const alert of stockAlerts) {
        const inv = (alert as Record<string, unknown>).inventory as Inventory | undefined;
        if (inv) {
          inventoryAlerts.push({
            itemName: inv.item_name,
            remaining: `${inv.current_stock}${inv.unit}`,
            threshold: `${inv.minimum_threshold}${inv.unit}`,
          });
        }
      }

      for (const item of inventoryItems) {
        if (item.current_stock < item.minimum_threshold && !alertedInventoryIds.has(item.id)) {
          inventoryAlerts.push({
            itemName: item.item_name,
            remaining: `${item.current_stock}${item.unit}`,
            threshold: `${item.minimum_threshold}${item.unit}`,
          });
        }
      }

      const insights: BriefingInsights = {
        estimatedWorkload: serviceCards.length > 5 ? 'High' : serviceCards.length > 2 ? 'Medium' : 'Low',
        customersToContact: remindersBriefing.length + customerAlerts.length,
        potentialDelays: [],
        inventoryRisks: [],
      };

      if (serviceCards.length === 0) {
        insights.estimatedWorkload = 'None';
      }

      const uncheckedWorkers = workers.filter(w => !w.checkedIn);
      if (uncheckedWorkers.length > 0) {
        insights.potentialDelays.push(`${uncheckedWorkers.length} worker(s) not yet checked in`);
      }

      if (inventoryAlerts.length > 0) {
        const critical = inventoryAlerts.filter(a => {
          const match = a.remaining.match(/^([\d.]+)/);
          const remaining = match ? parseFloat(match[1]) : 0;
          const thresholdMatch = a.threshold.match(/^([\d.]+)/);
          const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0;
          const usage = threshold > 0 ? remaining / threshold : 1;
          return usage < 0.5;
        });
        for (const alert of critical) {
          insights.inventoryRisks.push(`${alert.itemName} may run out within 3 days`);
        }
      }

      const briefing: DailyBriefing = {
        date: today,
        jobs: {
          total: serviceCards.length,
          pending: serviceCards.filter(j => j.job_status === 'pending').length,
          inProgress: serviceCards.filter(j => j.job_status === 'in_progress').length,
          completed: serviceCards.filter(j => j.job_status === 'completed').length,
          items: jobs,
        },
        workers: {
          totalActive: staffList.length,
          checkedIn: attendanceRecords.length,
          items: workers,
        },
        customerAlerts,
        inventoryAlerts,
        reminders: remindersBriefing,
        openSupportTickets: openTickets,
        insights,
      };

      return briefing;
    },
    staleTime: 60_000,
  });
}

async function refreshCustomerIntelligence(customerId: string) {
  await refreshCI(supabase, MERCHANT_ID, customerId);
}

// ─── Revenue Intelligence ────────────────────────────────────────

export function useRevenueIntelligence() {
  return useQuery({
    queryKey: ['revenue_intelligence'],
    queryFn: async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      const [cardsRes, remindersRes] = await Promise.all([
        supabase
          .from('service_cards')
          .select('*, customers(*), staff(*)')
          .eq('merchant_id', MERCHANT_ID)
          .order('service_date', { ascending: false }),
        supabase
          .from('reminder_responses')
          .select('*')
          .eq('merchant_id', MERCHANT_ID)
          .order('created_at', { ascending: false }),
      ]);

      const cards = (cardsRes.data ?? []) as unknown as ServiceCardWithDetails[];
      const reminders = (remindersRes.data ?? []) as ReminderResponse[];

      // Build a map of latest reminder per customer (for confirmed revenue)
      const latestReminderByCustomer = new Map<string, ReminderResponse>();
      for (const r of reminders) {
        const existing = latestReminderByCustomer.get(r.customer_id);
        if (!existing || new Date(r.sent_at) > new Date(existing.sent_at)) {
          latestReminderByCustomer.set(r.customer_id, r);
        }
      }

      // Build a map of card_id → card for looking up anchor card data
      const cardById = new Map(cards.map(c => [c.id, c]));

      // Run canonical pipeline for all customers
      const customerIds = [...new Set(cards.map(c => c.customer_id))];
      const pipelineResults = customerIds.length > 0
        ? evaluateCustomerAttentionBatch({
            serviceCards: cards,
            reminders,
            customerId: customerIds[0],
            merchantId: MERCHANT_ID,
            today,
          }, customerIds)
        : new Map<string, CustomerAttentionResult>();

      // Helper: build a SegmentedCustomer from a pipeline result
      function toSegmentedCustomer(result: CustomerAttentionResult): SegmentedCustomer {
        const anchorCard = cardById.get(result.lifecycleAnchorId);
        return {
          id: result.customerId,
          name: result.customerName,
          phone: result.customerPhone,
          address: anchorCard?.customers?.address ?? null,
          expectedValue: result.estimatedRevenue,
          serviceType: anchorCard?.service_type ?? 'standard_cleaning',
          serviceTypeLabel: anchorCard
            ? (SERVICE_TYPE_LABELS[anchorCard.service_type] ?? anchorCard.service_type)
            : 'Unknown',
          status: result.lifecycleState,
          daysOverdue: result.daysOverdue,
          lastServiceDate: result.lifecycleAnchorDate,
          healthScore: result.healthScore,
        };
      }

      // Find all unique customer IDs with next_service_date this month (the "due set")
      const dueSetCustomerIds = new Set<string>();
      for (const [, r] of pipelineResults) {
        if (r.nextServiceDate && r.nextServiceDate >= monthStart && r.nextServiceDate <= monthEnd) {
          dueSetCustomerIds.add(r.customerId);
        }
      }

      // Bucket pipeline results into segments (customers due this month, excl. active jobs)
      let potentialRevenueDueThisMonth = 0;
      const readyToBook: SegmentedCustomer[] = [];
      const followUpNeeded: SegmentedCustomer[] = [];
      const highChurnRisk: SegmentedCustomer[] = [];

      for (const [cid, result] of pipelineResults) {
        if (!dueSetCustomerIds.has(cid)) continue;
        if (result.lifecycleState === 'scheduled') continue;
        potentialRevenueDueThisMonth += result.estimatedRevenue;
        const customer = toSegmentedCustomer(result);
        if (result.lifecycleState === 'ready_to_book') readyToBook.push(customer);
        else if (result.lifecycleState === 'follow_up_needed') followUpNeeded.push(customer);
        else if (result.lifecycleState === 'high_churn_risk') highChurnRisk.push(customer);
      }

      // Overdue customers (not in due set, overdue next_service_date, not scheduled)
      for (const [cid, result] of pipelineResults) {
        if (dueSetCustomerIds.has(cid)) continue;
        if (!result.nextServiceDate || result.nextServiceDate >= todayStr) continue;
        if (result.lifecycleState === 'scheduled') continue;
        const customer = toSegmentedCustomer(result);
        if (customer.status === 'high_churn_risk') highChurnRisk.push(customer);
        else if (customer.status === 'ready_to_book') readyToBook.push(customer);
        else if (customer.status === 'follow_up_needed') followUpNeeded.push(customer);
      }

      // Calculate forecast (consumer-specific aggregation)
      let additionalExpected = 0;
      let additionalConfirmed = 0;
      let additionalAtRisk = 0;

      for (const card of cards) {
        if (card.service_date >= monthStart && card.service_date <= monthEnd) {
          if (!dueSetCustomerIds.has(card.customer_id)) {
            const val = estimateServiceValue(card);
            additionalExpected += val;
            if (card.job_status === 'completed' || card.job_status === 'in_progress') {
              additionalConfirmed += val;
            } else if (card.job_status === 'pending' && card.service_date < todayStr) {
              additionalAtRisk += val;
            }
          }
        }
      }

      const expectedRevenue = potentialRevenueDueThisMonth + additionalExpected;
      const confirmedRevenue = readyToBook.reduce((sum, c) => {
        const reminder = latestReminderByCustomer.get(c.id);
        if (reminder?.status === 'booked' || reminder?.status === 'responded') {
          return sum + c.expectedValue;
        }
        const hasCompletedThisMonth = cards.some(card =>
          card.customer_id === c.id &&
          card.job_status === 'completed' &&
          card.service_date >= monthStart &&
          card.service_date <= monthEnd
        );
        if (hasCompletedThisMonth) {
          return sum + c.expectedValue;
        }
        return sum;
      }, 0) + additionalConfirmed;

      const atRiskRevenue = highChurnRisk.reduce((sum, c) => sum + c.expectedValue, 0) + additionalAtRisk;

      // Total unique customers with next_service_date this month (all states)
      const customersDue = dueSetCustomerIds.size;

      // Additional unique customers serviced this month (not in due set)
      const additionalUniqueCustomers = new Set<string>();
      for (const card of cards) {
        if (card.service_date >= monthStart && card.service_date <= monthEnd) {
          if (!dueSetCustomerIds.has(card.customer_id)) {
            additionalUniqueCustomers.add(card.customer_id);
          }
        }
      }
      const jobsDueThisMonthCount = customersDue + additionalUniqueCustomers.size;

      // Reminder analytics
      const totalRemindersSent = reminders.length;
      const respondedCount = reminders.filter(r =>
        r.status === 'responded' || r.status === 'booked'
      ).length;
      const bookedCount = reminders.filter(r => r.status === 'booked').length;
      const conversionRate = totalRemindersSent > 0
        ? Math.round((bookedCount / totalRemindersSent) * 100)
        : 0;

      // Potential revenue recovery
      const potentialRevenueRecovery = highChurnRisk.reduce((sum, c) => sum + c.expectedValue, 0);

      // Insights
      const insights: string[] = [];
      const pipelineArray = [...pipelineResults.values()];
      const overdueMoreThan30 = pipelineArray.filter(r => r.daysOverdue > 30);
      if (overdueMoreThan30.length > 0) {
        insights.push(`${overdueMoreThan30.length} customer(s) are overdue by more than 30 days.`);
      }
      if (potentialRevenueRecovery > 0) {
        insights.push(`₹${potentialRevenueRecovery.toLocaleString('en-IN')} of potential revenue is currently recoverable.`);
      }
      if (conversionRate > 0) {
        insights.push(`Reminder conversion rate is at ${conversionRate}% this month.`);
      }
      if (readyToBook.length > 0) {
        insights.push(`${readyToBook[0].name} is likely due for follow-up.`);
      }
      if (highChurnRisk.length > 0) {
        insights.push(`${highChurnRisk.length} customer(s) at risk of churn — immediate action needed.`);
      }

      return {
        potentialRevenueDueThisMonth,
        customersDue,
        respondedToReminder: respondedCount,
        awaitingFollowUp: followUpNeeded.length,
        highChurnRisk: highChurnRisk.length,
        potentialRevenueRecovery,
        segments: {
          readyToBook,
          followUpNeeded,
          highChurnRisk,
        },
        reminderAnalytics: {
          totalSent: totalRemindersSent,
          responses: respondedCount,
          bookingsGenerated: bookedCount,
          conversionRate,
        },
        forecast: {
          jobsCount: jobsDueThisMonthCount,
          expected: expectedRevenue,
          confirmed: confirmedRevenue,
          atRisk: atRiskRevenue,
        },
        insights,
      } satisfies RevenueIntelligence;
    },
    staleTime: 30_000,
  });
}

export function useCreateReminderResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resp: {
      serviceCardId: string;
      customerId: string;
      response?: string;
      status: ReminderStatus;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('reminder_responses')
        .insert({
          service_card_id: resp.serviceCardId,
          merchant_id: MERCHANT_ID,
          customer_id: resp.customerId,
          sent_at: new Date().toISOString(),
          responded_at: resp.status !== 'sent' ? new Date().toISOString() : null,
          response: resp.response ?? null,
          status: resp.status,
          notes: resp.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['revenue_intelligence'] });
      if (variables.status === 'sent') {
        trackEvent('reminder_sent', {
          customer_id: variables.customerId,
          service_card_id: variables.serviceCardId,
          status: variables.status,
        });
      } else {
        trackEvent('reminder_response_received', {
          customer_id: variables.customerId,
          service_card_id: variables.serviceCardId,
          status: variables.status,
        });
      }
      refreshCustomerIntelligence(variables.customerId);
    },
  });
}

export function useUpdateCustomerIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ci: {
      customerId: string;
      segment: CustomerSegment;
      estimatedRevenue?: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('customer_intelligence')
        .upsert({
          merchant_id: MERCHANT_ID,
          customer_id: ci.customerId,
          segment: ci.segment,
          estimated_revenue: ci.estimatedRevenue ?? 0,
          notes: ci.notes ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'merchant_id, customer_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue_intelligence'] });
    },
  });
}

export function useSendFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, rating }: { cardId: string; rating: string }) => {
      const { data: card, error: cardErr } = await supabase
        .from('service_cards')
        .select('customers(phone, name)')
        .eq('id', cardId)
        .single();
      if (cardErr) throw cardErr;
      const c = card as unknown as { customers?: { phone?: string; name?: string } };
      const phone = c.customers?.phone ?? null;
      const name = c.customers?.name ?? null;
      if (phone) {
        const message = `Thank you for choosing AquaClean Services, ${name ?? 'Valued Customer'}!\n\nPlease rate our service:\n⭐ Google Review: https://g.page/r/review\n⭐ JustDial Review: https://justdial.com/review`;
        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`);
      }
      const { data, error } = await supabase
        .from('service_cards')
        .update({ feedback_sent: true, feedback_rating: rating })
        .eq('id', cardId)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, discount, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
  });
}
