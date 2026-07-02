import { getOpenWAConfig } from "../lib/openwa.js";
import { sendWithRetry } from "../lib/retry.js";
import { log } from "../lib/logger.js";
import { evaluateCustomerAttentionBatch } from "../lib/customer-attention-pipeline.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COMPONENT = "weekly-revenue";
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

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

    // Fetch all cards and reminders for pipeline evaluation
    const [cardsRes, remsRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/service_cards?select=*,customers(name,phone)&merchant_id=eq.${MERCHANT_ID}`,
        { headers }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/reminder_responses?select=*&merchant_id=eq.${MERCHANT_ID}`,
        { headers }
      ),
    ]);

    const cards = await cardsRes.json();
    const reminders = await remsRes.json();
    const allCards = Array.isArray(cards) ? cards : [];
    const allReminders = Array.isArray(reminders) ? reminders : [];

    // Run canonical pipeline for all customers
    const customerIds = [...new Set(allCards.map((c: any) => c.customer_id))];
    const pipelineResults = customerIds.length > 0
      ? evaluateCustomerAttentionBatch({
          serviceCards: allCards,
          reminders: allReminders,
          customerId: customerIds[0],
          merchantId: MERCHANT_ID,
          today,
        }, customerIds)
      : new Map();

    // Filter pipeline results for customers due this month
    let totalRevenue = 0;
    const dueCustomers: string[] = [];
    const nonResponders: string[] = [];

    for (const [, result] of pipelineResults) {
      if (!result.nextServiceDate) continue;
      if (result.nextServiceDate < monthStart || result.nextServiceDate > monthEnd) continue;
      if (result.lifecycleState === 'scheduled') continue;

      totalRevenue += result.estimatedRevenue;
      dueCustomers.push(result.customerName);

      if (result.reminderState === 'awaiting_response') {
        nonResponders.push(result.customerName);
      }
    }

    // Build message
    const lines: string[] = [];
    lines.push("📊 *Weekly Revenue Insight*");
    lines.push(`📅 ${today.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}`);
    lines.push("");
    lines.push(`👥 *${dueCustomers.length} customers due this month*`);
    lines.push(`💰 *Potential revenue: ₹${totalRevenue.toLocaleString("en-IN")}*`);
    lines.push("");

    if (nonResponders.length > 0) {
      lines.push(`⚠️ *${nonResponders.length} customer(s) haven't responded to reminders:*`);
      for (const name of nonResponders.slice(0, 5)) {
        lines.push(`   • ${name}`);
      }
      lines.push("");
      lines.push("👉 Consider sending follow-up reminders to these customers.");
    } else {
      lines.push("✅ All customers have responded to reminders.");
    }

    lines.push("");
    lines.push("Open AquaTrak for full details.");

    const message = lines.join("\n");

    // Send to merchant
    const merchantRes = await fetch(
      `${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`,
      { headers }
    );
    const merchantData = await merchantRes.json();
    const merchantPhone =
      Array.isArray(merchantData) && merchantData.length > 0 ? merchantData[0].phone : null;

    let whatsappSent = false;
    if (merchantPhone && openwaConfig.apiKey) {
      const result = await sendWithRetry(openwaConfig, merchantPhone, message);
      whatsappSent = result.ok;
    }

    // Log
    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "weekly_revenue",
        status: "success",
        error_message: whatsappSent ? null : "OpenWA not configured or merchant phone unavailable",
      }),
    });

    log.info(COMPONENT, "Weekly revenue insight sent", {
      dueCustomers: dueCustomers.length,
      totalRevenue,
      nonResponders: nonResponders.length,
      whatsappSent,
    });

    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(
      JSON.stringify({
        dueCustomers: dueCustomers.length,
        totalRevenue,
        nonResponders: nonResponders.length,
        whatsappSent,
        date: today.toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err: any) {
    log.error(COMPONENT, "Weekly revenue insight failed", { error: err.message });
    res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ error: err.message }));
  }
}
