export interface OpenWAConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

export function getOpenWAConfig(): OpenWAConfig {
  return {
    baseUrl: process.env.OPENWA_API_URL ?? "http://localhost:2785",
    apiKey: process.env.OPENWA_API_KEY ?? "",
    sessionId: process.env.OPENWA_SESSION_ID ?? "",
  };
}

function toJID(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    return `91${cleaned.slice(1)}@c.us`;
  }
  if (cleaned.startsWith("+")) {
    return `${cleaned.slice(1)}@c.us`;
  }
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `${cleaned}@c.us`;
  }
  return `${cleaned}@c.us`;
}

export async function sendWhatsAppMessage(
  config: OpenWAConfig,
  to: string,
  body: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!config.apiKey || !config.sessionId) {
    return { ok: false, error: "OpenWA not configured" };
  }

  const chatId = to.includes("@") ? to : toJID(to);

  try {
    const res = await fetch(
      `${config.baseUrl}/api/sessions/${config.sessionId}/messages/send-text`,
      {
        method: "POST",
        headers: {
          "X-API-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatId, text: body }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `OpenWA ${res.status}: ${errorText}` };
    }

    const data = await res.json();
    return { ok: true, messageId: data.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export function extractPhoneFromOpenWA(from: string): string {
  const phone = from.split("@")[0];
  if (phone.startsWith("91") && phone.length === 12) {
    return phone.slice(2);
  }
  return phone;
}

export interface OpenWAIncomingPayload {
  event: string;
  sessionId: string;
  timestamp: string;
  idempotencyKey: string;
  deliveryId: string;
  data: {
    id: string;
    from: string;
    to: string;
    chatId: string;
    body: string;
    type: string;
    timestamp: number;
    fromMe: boolean;
    isGroup: boolean;
    author?: string;
    contact?: { name?: string; pushName?: string };
    media?: { mimetype: string; filename?: string; data?: string };
    quotedMessage?: { id: string; body: string };
    location?: {
      latitude: number;
      longitude: number;
      description?: string;
      address?: string;
      url?: string;
    };
  };
}
