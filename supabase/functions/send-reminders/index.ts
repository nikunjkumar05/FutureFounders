import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const whatsappToken = Deno.env.get("WHATSAPP_TOKEN") ?? "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

    const today = new Date().toISOString().slice(0, 10);

    // Query service cards due today with no reminder sent
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
          // No WhatsApp configured, just mark reminder as sent
          await fetch(
            `${supabaseUrl}/rest/v1/service_cards?id=eq.${card.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
            }
          );
          sent++;
          continue;
        }

        const customer = card.customers;
        if (!customer?.phone) {
          failed++;
          continue;
        }

        // Send WhatsApp template message
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
          await fetch(
            `${supabaseUrl}/rest/v1/service_cards?id=eq.${card.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
            }
          );
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

        // Rate limiting: 300ms between calls
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        failed++;
      }
    }

    // Log successful run
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

    return new Response(
      JSON.stringify({ sent, failed, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
