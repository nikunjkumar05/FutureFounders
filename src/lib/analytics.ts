import posthog from 'posthog-js';

const DEV_ALLOWED = import.meta.env.VITE_ENABLE_ANALYTICS_DEV === 'true';

function getBlockedEmails(): string[] {
  try {
    const raw = import.meta.env.VITE_ANALYTICS_BLOCKED_EMAILS as string | undefined;
    if (!raw) return [];
    return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function shouldTrackUser(email?: string | null): boolean {
  if (!DEV_ALLOWED && import.meta.env.DEV) return false;
  const blocked = getBlockedEmails();
  if (blocked.length > 0 && email) {
    if (blocked.includes(email.toLowerCase())) return false;
  }
  return true;
}

type AnalyticsEvent =
  | 'job_created'
  | 'job_updated'
  | 'job_completed'
  | 'job_deleted'
  | 'customer_created'
  | 'customer_updated'
  | 'customer_deleted'
  | 'worker_created'
  | 'worker_updated'
  | 'worker_deleted'
  | 'advance_paid'
  | 'inventory_item_added'
  | 'inventory_item_updated'
  | 'inventory_item_deleted'
  | 'stock_consumed'
  | 'reminder_sent'
  | 'reminder_response_received'
  | 'duplicate_customer_detected'
  | 'duplicate_customer_creation_confirmed'
  | 'duplicate_customer_creation_cancelled'
  | 'dashboard_viewed'
  | 'inventory_checked'
  | 'job_discount_updated';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!shouldTrackUser()) return;
  posthog.capture(event, {
    $set: { last_event: event, last_event_at: new Date().toISOString() },
    ...properties,
    environment: import.meta.env.DEV ? 'development' : 'production',
    timestamp: new Date().toISOString(),
  });
}

export { shouldTrackUser, trackEvent };
export type { AnalyticsEvent, AnalyticsProperties };
