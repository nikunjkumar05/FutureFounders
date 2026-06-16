import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  Customer,
  ServiceCardWithDetails,
  Staff,
  Attendance,
  AttendanceWithStaff,
  Inventory,
  StockAlert,
  SupportTicket,
  JobStatus,
  ServiceType,
  DailyBriefing,
  BriefingJob,
  BriefingWorker,
  BriefingCustomerAlert,
  BriefingInventoryAlert,
  BriefingReminder,
  BriefingInsights,
  RevenueIntelligence,
  CustomerSegmentItem,
  CustomerSegment,
  ReminderAnalyticsData,
  BusinessInsight,
  ServiceCardWithRevenue,
} from './types';
import { SERVICE_TYPE_LABELS, getServicesFromDetails, getTotalCharge } from './types';

const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

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
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at, customers(*), staff(*)')
        .eq('merchant_id', MERCHANT_ID)
        .order('service_date', { ascending: false });
      if (status) q = q.eq('job_status', status);
      const { data, error } = await q;
      if (error) throw error;
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
        const nextDate = new Date(
          Date.now() + 180 * 86400000
        ).toISOString().slice(0, 10);
        updates.next_service_date = nextDate;
      }
      const { data, error } = await supabase
        .from('service_cards')
        .update(updates)
        .eq('id', id)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
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

      const { data, error } = await supabase
        .from('service_cards')
        .insert(payload)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) {
        console.error('Create job error:', error);
        throw new Error(error.message || 'Failed to create job in database');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
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
      const { data: alerts } = await supabase
        .from('stock_alerts')
        .select('*, inventory(*)')
        .eq('merchant_id', MERCHANT_ID)
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      const { data: allAlerts } = await supabase
        .from('stock_alerts')
        .select('inventory_id')
        .eq('merchant_id', MERCHANT_ID);

      const { data: inventory } = await supabase
        .from('inventory')
        .select('*')
        .eq('merchant_id', MERCHANT_ID);

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
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
  });
}

// Dashboard metrics
export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const [pending, inProgress, completed, reminders, stockAlerts, inventory, attendance] = await Promise.all([
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
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .lte('next_service_date', today)
          .is('reminder_sent_at', null),
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
      ]);

      const unresolvedAlerts = stockAlerts.count ?? 0;
      const belowThreshold = (inventory.data ?? []).filter(
        (i: { current_stock: number; minimum_threshold: number }) => i.current_stock < i.minimum_threshold
      ).length;

      return {
        pendingJobs: pending.count ?? 0,
        inProgressJobs: inProgress.count ?? 0,
        jobsCompletedThisWeek: completed.count ?? 0,
        dueReminders: reminders.count ?? 0,
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
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
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
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      const { data, error } = await supabase
        .from('attendance')
        .select('*, staff(name, daily_wage_inr)')
        .eq('merchant_id', MERCHANT_ID)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      if (error) throw error;
      return data as (Attendance & { staff: Pick<Staff, 'name' | 'daily_wage_inr'> })[];
    },
    enabled: !!month,
  });
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
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('merchant_id', MERCHANT_ID)
        .eq('phone', customer.phone)
        .maybeSingle();
      if (existing) {
        throw new Error('A customer with this phone number already exists');
      }
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
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
      };

      const { data, error } = await supabase
        .from('service_cards')
        .update(payload)
        .eq('id', job.id)
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) {
        console.error('Update job error:', error);
        throw new Error(error.message || 'Failed to update job');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_cards'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
    },
  });
}

// Staff management
export function useAddStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { name: string; phone: string; dailyWage: number }) => {
      const { data, error } = await supabase
        .from('staff')
        .insert({
          merchant_id: MERCHANT_ID,
          name: s.name,
          phone: s.phone,
          daily_wage_inr: s.dailyWage,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { id: string; name: string; phone: string; dailyWage: number; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('staff')
        .update({
          name: s.name,
          phone: s.phone,
          daily_wage_inr: s.dailyWage,
          is_active: s.isActive,
        })
        .eq('id', s.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
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
        jobsRes,
        staffRes,
        attendanceRes,
        inventoryRes,
        stockAlertsRes,
        remindersRes,
        ticketsRes,
      ] = await Promise.all([
        supabase
          .from('service_cards')
          .select('*, customers(*), staff(*)')
          .eq('merchant_id', MERCHANT_ID)
          .eq('service_date', today),
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
          .from('service_cards')
          .select('*, customers(*)')
          .eq('merchant_id', MERCHANT_ID)
          .lte('next_service_date', today)
          .is('reminder_sent_at', null),
        supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
      ]);

      const serviceCards = (jobsRes.data ?? []) as unknown as ServiceCardWithDetails[];
      const staffList = (staffRes.data ?? []) as Staff[];
      const attendanceRecords = (attendanceRes.data ?? []) as AttendanceWithStaff[];
      const inventoryItems = (inventoryRes.data ?? []) as Inventory[];
      const stockAlerts = stockAlertsRes.data ?? [];
      const remindersCards = (remindersRes.data ?? []) as unknown as (ServiceCardWithDetails)[];
      const openTickets = ticketsRes.count ?? 0;

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

      const reminders: BriefingReminder[] = remindersCards.map(card => ({
        customerName: card.customers?.name ?? 'Unknown',
        serviceTypeLabel: SERVICE_TYPE_LABELS[card.service_type] ?? card.service_type,
        dueDate: card.next_service_date ?? 'N/A',
      }));

      const insights: BriefingInsights = {
        estimatedWorkload: serviceCards.length > 5 ? 'High' : serviceCards.length > 2 ? 'Medium' : 'Low',
        customersToContact: reminders.length + customerAlerts.length,
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
        reminders,
        openSupportTickets: openTickets,
        insights,
      };

      return briefing;
    },
    staleTime: 60_000,
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
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
  });
}

// ─── Revenue Intelligence ──────────────────────────────────────

const DEFAULT_PRICING: Record<string, { base: number; perLitre?: number }> = {
  standard_cleaning: { base: 800, perLitre: 0.4 },
  deep_cleaning: { base: 1200, perLitre: 0.6 },
  sofa_cleaning: { base: 500 },
  seats_cleaning: { base: 300 },
  carpet_cleaning: { base: 800 },
  custom_service: { base: 500 },
};

function estimateServiceValue(card: ServiceCardWithRevenue): number {
  const details = (card.service_details ?? {}) as Record<string, unknown>;
  const totalCharge = getTotalCharge(details);
  if (totalCharge > 0) return totalCharge;

  const services = getServicesFromDetails(details);
  if (services.length > 0) {
    return services.reduce((sum, g) => sum + (g.totalPrice || 0), 0);
  }

  const pricing = DEFAULT_PRICING[card.service_type] ?? DEFAULT_PRICING.custom_service;
  let total = pricing.base;
  const tankCap = (details.tankCapacity as number) || 0;
  if (pricing.perLitre && tankCap > 0) {
    total = Math.round(tankCap * pricing.perLitre);
  }
  return total;
}

function getDaysOverdue(card: ServiceCardWithRevenue): number {
  if (!card.next_service_date) return 0;
  const dueDate = new Date(card.next_service_date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
  return Math.max(0, diff);
}

function isDueThisMonth(card: ServiceCardWithRevenue): boolean {
  if (!card.next_service_date) return false;
  const due = new Date(card.next_service_date + 'T00:00:00');
  const now = new Date();
  return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
}

function getSegmentForCard(card: ServiceCardWithRevenue): CustomerSegment | null {
  const response = card.reminder_response;
  const daysOverdue = getDaysOverdue(card);
  const reminderSent = !!card.reminder_sent_at;
  const reminderCount = card.reminder_count ?? (reminderSent ? 1 : 0);

  if (response === 'interested') return 'ready_to_book';

  if (daysOverdue >= 30 && reminderCount >= 2 && response !== 'not_interested') {
    return 'high_churn_risk';
  }

  if (reminderSent && response === null) return 'follow_up_needed';

  if (daysOverdue > 0 && reminderSent) return 'high_churn_risk';

  return null;
}

export function useRevenueIntelligence() {
  return useQuery({
    queryKey: ['revenue_intelligence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cards')
        .select('id, customer_id, merchant_id, service_type, service_details, service_date, next_service_date, job_status, technician_id, notes, feedback_sent, feedback_rating, reminder_sent_at, reminder_response, reminder_response_at, reminder_count, created_at, customers(*), staff(*)')
        .eq('merchant_id', MERCHANT_ID)
        .order('next_service_date', { ascending: true });

      if (error) throw error;
      const cards = (data ?? []) as unknown as ServiceCardWithRevenue[];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const segmentItems: CustomerSegmentItem[] = [];
      let totalRevenueDue = 0;
      let customersDue = 0;
      let respondedCount = 0;
      let awaitingCount = 0;
      let churnCount = 0;
      let recoveryTotal = 0;
      let totalRemindersSent = 0;
      let totalResponses = 0;

      for (const card of cards) {
        const value = estimateServiceValue(card);
        const segment = getSegmentForCard(card);
        const daysOverdue = getDaysOverdue(card);
        const reminderSent = !!card.reminder_sent_at;

        if (reminderSent) totalRemindersSent++;
        if (card.reminder_response === 'interested') respondedCount++;
        if (card.reminder_response === 'interested' || card.reminder_response === 'not_interested') totalResponses++;

        if (isDueThisMonth(card)) {
          totalRevenueDue += value;
          customersDue++;
        }

        if (segment === 'follow_up_needed') awaitingCount++;
        if (segment === 'high_churn_risk') {
          churnCount++;
          recoveryTotal += value;
        }

        if (segment) {
          segmentItems.push({
            customerId: card.customer_id,
            customerName: card.customers?.name ?? 'Unknown',
            customerPhone: card.customers?.phone ?? '',
            segment,
            expectedValue: value,
            daysOverdue,
            lastServiceDate: card.service_date,
            lastServiceType: card.service_type as ServiceType,
            serviceCardId: card.id,
          });
        }
      }

      const revenueIntelligence: RevenueIntelligence = {
        potentialRevenueDue: totalRevenueDue,
        customersDue,
        respondedToReminder: respondedCount,
        awaitingFollowUp: awaitingCount,
        highChurnRisk: churnCount,
        potentialRevenueRecovery: recoveryTotal,
        totalCustomers: cards.length,
      };

      const reminderAnalytics: ReminderAnalyticsData = {
        totalSent: totalRemindersSent,
        responses: totalResponses,
        bookingsGenerated: respondedCount,
        conversionRate: totalRemindersSent > 0 ? Math.round((respondedCount / totalRemindersSent) * 100) : 0,
      };

      const insights: BusinessInsight[] = [];

      const highRiskItems = segmentItems.filter(s => s.segment === 'high_churn_risk');
      const overdue30plus = highRiskItems.filter(s => s.daysOverdue >= 30);
      if (overdue30plus.length > 0) {
        insights.push({
          type: 'warning',
          message: `${overdue30plus.length} customer(s) are overdue by more than 30 days.`,
        });
      }

      if (revenueIntelligence.potentialRevenueRecovery > 0) {
        insights.push({
          type: 'info',
          message: `₹${revenueIntelligence.potentialRevenueRecovery.toLocaleString('en-IN')} of potential revenue is currently recoverable.`,
        });
      }

      if (reminderAnalytics.conversionRate > 0) {
        insights.push({
          type: 'positive',
          message: `Reminder conversion rate is ${reminderAnalytics.conversionRate}% this month.`,
        });
      }

      const readyItems = segmentItems.filter(s => s.segment === 'ready_to_book');
      if (readyItems.length > 0) {
        const names = readyItems.slice(0, 2).map(s => s.customerName).join(', ');
        insights.push({
          type: 'positive',
          message: `${readyItems.length} customer(s) ready to book: ${names}.`,
        });
      }

      const followUpItems = segmentItems.filter(s => s.segment === 'follow_up_needed');
      if (followUpItems.length > 0) {
        insights.push({
          type: 'info',
          message: `${followUpItems.length} customer(s) need follow-up. Send them a WhatsApp reminder today.`,
        });
      }

      const dueNotResponded = cards.filter(c =>
        isDueThisMonth(c) && !c.reminder_sent_at
      );
      if (dueNotResponded.length > 0) {
        insights.push({
          type: 'info',
          message: `${dueNotResponded.length} customer(s) due this month haven't received a reminder yet.`,
        });
      }

      const respondedNotBooked = cards.filter(c =>
        c.reminder_response === 'interested' && (c.job_status === 'pending' || c.job_status === 'completed')
      );
      if (respondedNotBooked.length > 0) {
        insights.push({
          type: 'positive',
          message: `${respondedNotBooked.length} interested customer(s) haven't been scheduled yet. Convert them today!`,
        });
      }

      return {
        revenueIntelligence,
        segments: segmentItems,
        reminderAnalytics,
        insights,
        cards,
      };
    },
    staleTime: 60_000,
  });
}

export function useUpdateReminderResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cardId,
      response,
    }: {
      cardId: string;
      response: 'interested' | 'not_interested';
    }) => {
      const { data, error } = await supabase
        .from('service_cards')
        .update({
          reminder_response: response,
          reminder_response_at: new Date().toISOString(),
        })
        .eq('id', cardId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue_intelligence'] });
      qc.invalidateQueries({ queryKey: ['service_cards'] });
    },
  });
}

export function useIncrementReminderCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      const { data: current, error: fetchError } = await supabase
        .from('service_cards')
        .select('reminder_count')
        .eq('id', cardId)
        .single();
      if (fetchError) throw fetchError;

      const currentCount = (current as { reminder_count: number | null }).reminder_count ?? 0;

      const { data, error } = await supabase
        .from('service_cards')
        .update({
          reminder_count: currentCount + 1,
          reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', cardId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue_intelligence'] });
      qc.invalidateQueries({ queryKey: ['service_cards'] });
    },
  });
}
