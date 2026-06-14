const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export function getTwilioConfig(): TwilioConfig {
  return {
    accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") ?? "",
    authToken: Deno.env.get("TWILIO_AUTH_TOKEN") ?? "",
    whatsappNumber: Deno.env.get("TWILIO_WHATSAPP_NUMBER") || "whatsapp:+14155238886",
  };
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
        Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
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

export function extractPhoneFromTwilio(from: string): string {
  let phone = from.replace("whatsapp:", "").replace("+", "");
  if (phone.startsWith("91") && phone.length === 12) {
    phone = phone.slice(2);
  }
  return phone;
}
