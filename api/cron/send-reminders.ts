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
    const whatsappToken = process.env.WHATSAPP_TOKEN ?? "";
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

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
        if (!whatsappToken || !phoneNumberId) {
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

        const waRes = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${whatsappToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: `91${customer.phone}`,
              type: "template",
              template: {
                name: "tank_cleaning_reminder",
                language: { code: "en" },
                components: [
                  {
                    type: "body",
                    parameters: [
                      { type: "text", text: customer.name },
                      { type: "text", text: "AquaClean Services" },
                    ],
                  },
                ],
              },
            }),
          }
        );

        if (waRes.ok) {
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
          const errBody = await waRes.text();
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
              error_message: `WhatsApp API error for card ${card.id}: ${errBody}`,
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