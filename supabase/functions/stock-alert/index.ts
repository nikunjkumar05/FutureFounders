import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getOpenWAConfig, sendWhatsAppMessage } from "../lib/openwa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const alertsRes = await fetch(
      `${supabaseUrl}/rest/v1/stock_alerts?select=*,inventory!inner(item_name,current_stock,minimum_threshold,merchant_id)&resolved=eq.false`,
      { headers: dbHeaders }
    );
    const alerts = await alertsRes.json();

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return new Response(
        JSON.stringify({ notified: 0, message: "No unresolved alerts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const merchantId = alerts[0]?.inventory?.merchant_id;
    const merchRes = await fetch(
      `${supabaseUrl}/rest/v1/merchants?id=eq.${merchantId}&select=phone,business_name`,
      { headers: dbHeaders }
    );
    const merchants = await merchRes.json();
    const merchant = Array.isArray(merchants) ? merchants[0] : null;

    if (!merchant?.phone) {
      return new Response(
        JSON.stringify({ notified: 0, error: "Merchant phone not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const items = alerts.map((a: Record<string, unknown>) => {
      const inv = a.inventory as Record<string, unknown>;
      return `${inv.item_name}: ${inv.current_stock} left (min: ${inv.minimum_threshold})`;
    });

    const message = `Low Stock Alert!\n\nThe following items need reordering:\n${items.join("\n")}\n\nPlease restock soon.`;

    let sent = 0;
    const openwaConfig = getOpenWAConfig();
    const result = await sendWhatsAppMessage(openwaConfig, merchant.phone, message);

    if (result.ok) sent = alerts.length;

    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        type: "stock_alert",
        status: result.ok ? "success" : "failed",
        error_message: result.ok ? null : result.error,
      }),
    });

    return new Response(
      JSON.stringify({
        notified: sent,
        alerts: alerts.length,
        merchant: merchant.business_name,
        message: sent > 0 ? "WhatsApp alert sent" : "WhatsApp not configured",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
