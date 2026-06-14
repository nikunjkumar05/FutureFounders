import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getTwilioConfig, sendTwilioMessage } from "../lib/twilio.ts";

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
    const twilioConfig = getTwilioConfig();

    for (const card of cards) {
      try {
        if (!twilioConfig.accountSid || !twilioConfig.authToken) {
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

        const reminderMessage = `Hi ${customer.name}! It's been 6 months since your water tank cleaning with us. Dirty tanks breed bacteria — your family's health matters! Book your cleaning today. Reply YES to confirm or call us at 9876543210. — AquaClean Services`;

        const result = await sendTwilioMessage(twilioConfig, customer.phone, reminderMessage);

        if (result.ok) {
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
              error_message: `Twilio error for card ${card.id}: ${result.error}`,
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
