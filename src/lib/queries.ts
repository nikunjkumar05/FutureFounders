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
        .select('*, customers(*), staff(*)')
        .eq('merchant_id', MERCHANT_ID)
        .order('service_date', { ascending: false });
      if (status) q = q.eq('job_status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data as ServiceCardWithDetails[];
    },
  });
}

export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const { data, error } = await supabase
        .from('service_cards')
        .update({ job_status: status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
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
      // Get unresolved stock_alerts
      const { data: alerts } = await supabase
        .from('stock_alerts')
        .select('*, inventory(*)')
        .eq('merchant_id', MERCHANT_ID)
        .eq('resolved', false)
        .order('created_at', { ascending: false });

      // Also check inventory items below threshold that might not have alerts
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
        .select()
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

      const [reminders, stockAlerts, inventory, attendance, completed] = await Promise.all([
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
        supabase
          .from('service_cards')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', MERCHANT_ID)
          .eq('job_status', 'completed')
          .gte('service_date', weekAgo),
      ]);

      const unresolvedAlerts = stockAlerts.count ?? 0;
      const belowThreshold = (inventory.data ?? []).filter(
        (i: { current_stock: number; minimum_threshold: number }) => i.current_stock < i.minimum_threshold
      ).length;

      return {
        dueReminders: reminders.count ?? 0,
        lowStockAlerts: unresolvedAlerts + belowThreshold,
        staffCheckedIn: attendance.count ?? 0,
        jobsCompletedThisWeek: completed.count ?? 0,
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
    mutationFn: async (customer: Omit<Customer, 'id' | 'merchant_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...customer, merchant_id: MERCHANT_ID })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// Add service card
export function useAddServiceCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (card: {
      customerId: string;
      serviceDate: string;
      technicianId?: string;
      notes?: string;
    }) => {
      const nextDate = new Date(
        new Date(card.serviceDate).getTime() + 180 * 86400000
      )
        .toISOString()
        .slice(0, 10);
      const { data, error } = await supabase
        .from('service_cards')
        .insert({
          customer_id: card.customerId,
          merchant_id: MERCHANT_ID,
          service_date: card.serviceDate,
          next_service_date: nextDate,
          technician_id: card.technicianId ?? null,
          notes: card.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_cards'] }),
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
