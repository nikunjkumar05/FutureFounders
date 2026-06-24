import { getOpenWAConfig, sendWhatsAppMessage } from "../lib/openwa.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  try {
    const cronSecret = process.env.CRON_SECRET ?? "";
    const authHeader = req.headers.authorization ?? "";
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const openwaConfig = getOpenWAConfig();

    const today = new Date().toISOString().slice(0, 10);

    const cardsRes = await fetch(
      `${supabaseUrl}/rest/v1/service_cards?select=id,customer_id,next_service_date,reminder_sent_at,customers(name,phone)&next_service_date=lte.${today}&reminder_sent_at=is.null&job_status=eq.pending`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const cards = await cardsRes.json();
    if (!Array.isArray(cards)) {
      throw new Error("Failed to fetch service cards");
    }

    let sent = 0;
    let failed = 0;

    for (const card of cards) {
      try {
        if (!openwaConfig.apiKey || !openwaConfig.sessionId) {
          await fetch(`${supabaseUrl}/rest/v1/service_cards?id=eq.${card.id}`, {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
          });
          sent++;
          continue;
        }

        const customer = card.customers;
        if (!customer?.phone) {
          failed++;
          continue;
        }

        const reminderMessage = `Namaste ${customer.name}! Aapke paani ki tanki ki safai ka samay aa gaya hai. Gande tank se bimariyan failti hain. Aaj hi safai book karein! Reply YES to confirm or call 9876543210. — AquaClean Services`;

        const result = await sendWhatsAppMessage(
          openwaConfig,
          customer.phone,
          reminderMessage
        );

        if (result.ok) {
          await fetch(`${supabaseUrl}/rest/v1/service_cards?id=eq.${card.id}`, {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
          });
          sent++;
        } else {
          await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "send_reminder",
              status: "failed",
              error_message: `OpenWA error for card ${card.id}: ${result.error}`,
            }),
          });
          failed++;
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch {
        failed++;
      }
    }

    if (sent > 0 || failed > 0) {
      await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "send_reminder",
          status: failed > 0 ? "partial" : "success",
          error_message: failed > 0 ? `${failed} reminders failed` : null,
        }),
      });
    }

    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ sent, failed, timestamp: new Date().toISOString() }));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ error: err.message }));
  }
}
