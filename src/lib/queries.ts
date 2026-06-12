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
} from './types';

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
    }: {
      staffId: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          staff_id: staffId,
          merchant_id: MERCHANT_ID,
          checkin_time: new Date().toISOString(),
          verified_location: false,
          date: new Date().toISOString().slice(0, 10),
          notes: notes ?? 'Manual check-in',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
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

      const { data: inventory } = await supabase
        .from('inventory')
        .select('*')
        .eq('merchant_id', MERCHANT_ID);

      const alertIds = new Set((alerts ?? []).map(a => a.inventory_id));
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
    mutationFn: async ({ alertId }: { alertId: string }) => {
      const { data, error } = await supabase
        .from('stock_alerts')
        .update({ resolved: true })
        .eq('id', alertId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_alerts'] }),
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
      tankCapacityLiters?: number | null;
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
          tank_capacity_liters: customer.tankCapacityLiters ?? 1000,
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
      tankCapacityLiters?: number | null;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      const { data, error } = await supabase
        .from('customers')
        .update({
          name: customer.name,
          phone: customer.phone,
          address: customer.address ?? null,
          tank_capacity_liters: customer.tankCapacityLiters ?? 1000,
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
