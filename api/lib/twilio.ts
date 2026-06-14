const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export function getTwilioConfig(): TwilioConfig {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886",
  };
}

export function getTwilioAuthHeader(config: TwilioConfig): string {
  const credentials = `${config.accountSid}:${config.authToken}`;
  const encoded = Buffer.from(credentials).toString("base64");
  return `Basic ${encoded}`;
}

export async function sendTwilioMessage(
  config: TwilioConfig,
  to: string,
  body: string
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!config.accountSid || !config.authToken) {
    return { ok: false, error: "Twilio credentials not configured" };
  }

  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to.startsWith("+") ? to : `+91${to}`}`;
  const params = new URLSearchParams({
    To: toNumber,
    From: config.whatsappNumber,
    Body: body,
  });

  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: getTwilioAuthHeader(config),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    return { ok: false, error: errorText };
  }

  const data = await res.json();
  return { ok: true, sid: data.sid };
}

export interface TwilioWebhookBody {
  From: string;
  Body: string;
  Latitude?: string;
  Longitude?: string;
  NumMedia?: string;
  MessageSid?: string;
  AccountSid?: string;
}

export function parseTwilioWebhook(body: Record<string, unknown>): TwilioWebhookBody | null {
  const from = body.From as string | undefined;
  const messageBody = body.Body as string | undefined;

  if (!from || !messageBody) return null;

  return {
    From: from,
    Body: messageBody,
    Latitude: body.Latitude as string | undefined,
    Longitude: body.Longitude as string | undefined,
    NumMedia: body.NumMedia as string | undefined,
    MessageSid: body.MessageSid as string | undefined,
    AccountSid: body.AccountSid as string | undefined,
  };
}

export function extractPhoneFromTwilio(from: string): string {
  return from.replace("whatsapp:", "").replace("+", "");
}
