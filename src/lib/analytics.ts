import posthog from 'posthog-js';

function isDev(): boolean {
  return import.meta.env.DEV;
}

function getBlockedEmail(): string | null {
  try {
    const raw = import.meta.env.VITE_ANALYTICS_BLOCKED_EMAILS as string | undefined;
    if (!raw) return null;
    return raw.toLowerCase();
  } catch {
    return null;
  }
}

function shouldTrackUser(): boolean {
  if (isDev()) return false;
  const blocked = getBlockedEmail();
  if (blocked) return false;
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
  | 'reminder_response_received';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!shouldTrackUser()) return;
  posthog.capture(event, {
    $set: { last_event: event, last_event_at: new Date().toISOString() },
    ...properties,
    environment: 'production',
    timestamp: new Date().toISOString(),
  });
}

export { shouldTrackUser, trackEvent };
export type { AnalyticsEvent, AnalyticsProperties };
