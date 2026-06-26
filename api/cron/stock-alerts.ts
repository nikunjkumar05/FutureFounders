import { getOpenWAConfig } from "../lib/openwa.js";
import { sendWithRetry } from "../lib/retry.js";
import { log } from "../lib/logger.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COMPONENT = "stock-alerts";
const MERCHANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

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
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // Fetch inventory below threshold
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/inventory?select=*&merchant_id=eq.${MERCHANT_ID}&current_stock=lt.minimum_threshold`,
      { headers }
    );
    const lowItems = await invRes.json();

    if (!Array.isArray(lowItems) || lowItems.length === 0) {
      log.info(COMPONENT, "No low stock items found");
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ alerts: 0, timestamp: new Date().toISOString() }));
      return;
    }

    // Check which items already have unresolved alerts
    const alertRes = await fetch(
      `${supabaseUrl}/rest/v1/stock_alerts?select=inventory_id&merchant_id=eq.${MERCHANT_ID}&resolved=eq.false`,
      { headers }
    );
    const existingAlerts = await alertRes.json();
    const alertedIds = new Set(
      Array.isArray(existingAlerts) ? existingAlerts.map((a: any) => a.inventory_id) : []
    );

    let created = 0;
    for (const item of lowItems) {
      if (alertedIds.has(item.id)) continue;

      await fetch(`${supabaseUrl}/rest/v1/stock_alerts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          inventory_id: item.id,
          merchant_id: MERCHANT_ID,
          alert_type: "low_stock",
          resolved: false,
        }),
      });
      created++;
    }

    // Send WhatsApp alert to merchant
    if (created > 0 || lowItems.length > 0) {
      const merchantRes = await fetch(
        `${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`,
        { headers }
      );
      const merchantData = await merchantRes.json();
      const merchantPhone =
        Array.isArray(merchantData) && merchantData.length > 0 ? merchantData[0].phone : null;

      if (merchantPhone && openwaConfig.apiKey) {
        const lines = lowItems.map(
          (item: any) => `• ${item.item_name}: ${item.current_stock}${item.unit} (min: ${item.minimum_threshold}${item.unit})`
        );
        const message = `⚠️ *Low Stock Alert*\n\n${lines.join("\n")}\n\nPlease reorder supplies.`;
        await sendWithRetry(openwaConfig, merchantPhone, message);
      }
    }

    // Log
    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "stock_alerts",
        status: "success",
        error_message: created > 0 ? `${created} new alerts created` : null,
      }),
    });

    log.info(COMPONENT, "Stock alert check complete", {
      lowItems: lowItems.length,
      newAlerts: created,
    });

    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(
      JSON.stringify({
        lowItems: lowItems.length,
        newAlerts: created,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err: any) {
    log.error(COMPONENT, "Stock alert cron failed", { error: err.message });
    res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ error: err.message }));
  }
}
