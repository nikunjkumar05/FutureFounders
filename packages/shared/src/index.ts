import { z } from "zod";

// === Enums ===
export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type CheckInStatus = "on_time" | "late" | "outside_geofence";
export type ReminderStatus = "pending" | "sent" | "converted" | "failed";

// === Business ===
export const BusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string(),
  address: z.string().optional(),
});
export type Business = z.infer<typeof BusinessSchema>;

// === Worker ===
export const WorkerSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string(),
  active: z.boolean(),
});
export type Worker = z.infer<typeof WorkerSchema>;

// === Customer ===
export const CustomerSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string(),
  address: z.string().optional(),
  property_type: z.string().optional(),
});
export type Customer = z.infer<typeof CustomerSchema>;

// === Job ===
export const JobSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  worker_id: z.string().uuid().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  site_lat: z.number().optional().nullable(),
  site_lng: z.number().optional().nullable(),
  geofence_radius: z.number().default(100),
  scheduled_date: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

// === Inventory ===
export const InventorySchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  name: z.string().min(1),
  unit: z.string(),
  quantity: z.number(),
  min_threshold: z.number().default(1),
});
export type Inventory = z.infer<typeof InventorySchema>;

// === CheckIn ===
export const CheckInSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  status: z.enum(["on_time", "late", "outside_geofence"]),
  reported_lat: z.number().optional().nullable(),
  reported_lng: z.number().optional().nullable(),
  distance_meters: z.number().optional().nullable(),
});
export type CheckIn = z.infer<typeof CheckInSchema>;

// === Service Reminder ===
export const ServiceReminderSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  job_id: z.string().uuid().nullable(),
  due_date: z.string(),
  status: z.enum(["pending", "sent", "converted", "failed"]),
});
export type ServiceReminder = z.infer<typeof ServiceReminderSchema>;

// === API Webhook Payloads ===
export const WhatsAppLocationPayloadSchema = z.object({
  from: z.string(),
  timestamp: z.string(),
  lat: z.number(),
  lng: z.number(),
  job_id: z.string().uuid(),
  worker_id: z.string().uuid(),
});
export type WhatsAppLocationPayload = z.infer<typeof WhatsAppLocationPayloadSchema>;

export const JobCompletePayloadSchema = z.object({
  job_id: z.string().uuid(),
  inventory_used: z.array(z.object({
    inventory_id: z.string().uuid(),
    quantity: z.number(),
  })).optional(),
});
export type JobCompletePayload = z.infer<typeof JobCompletePayloadSchema>;
