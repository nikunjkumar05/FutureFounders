import { getOpenWAConfig, sendWhatsAppMessage } from "../lib/openwa.js";
import { evaluateCustomerAttentionBatch } from "../lib/customer-attention-pipeline.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MERCHANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  standard_cleaning: "Tank Cleaning",
  deep_cleaning: "Deep Cleaning",
  sofa_cleaning: "Sofa Cleaning",
  seats_cleaning: "Seats Cleaning",
  carpet_cleaning: "Carpet Cleaning",
  custom_service: "Custom Service",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildBriefingText(data: any, date: string): string {
  const lines: string[] = [];
  lines.push("📋 *Daily Operations Briefing*");
  lines.push(`📅 ${formatDate(date)}`);
  lines.push("");

  // Jobs
  const jobs = data.jobs ?? [];
  const pending = jobs.filter((j: any) => j.job_status === "pending").length;
  const inProgress = jobs.filter((j: any) => j.job_status === "in_progress").length;
  const completed = jobs.filter((j: any) => j.job_status === "completed").length;
  lines.push(`📌 *Today's Jobs: ${jobs.length}*`);
  lines.push(`   Pending: ${pending} · In Progress: ${inProgress} · Completed: ${completed}`);
  for (const job of jobs.slice(0, 10)) {
    const label = SERVICE_TYPE_LABELS[job.service_type] ?? job.service_type;
    const customer = job.customers?.name ?? "Unknown";
    const worker = job.staff?.name ?? "Unassigned";
    const status = job.job_status === "pending" ? "⏳" : job.job_status === "in_progress" ? "🔄" : "✅";
    lines.push(`   ${status} ${customer} — ${label} (${worker})`);
  }
  lines.push("");

  // Workers
  const staff = data.staff ?? [];
  const attendance = data.attendance ?? [];
  const checkedInIds = new Set(attendance.map((a: any) => a.staff_id));
  const checkedIn = staff.filter((s: any) => checkedInIds.has(s.id));
  const notCheckedIn = staff.filter((s: any) => !checkedInIds.has(s.id));
  lines.push(`👥 *Workers: ${checkedIn.length}/${staff.length} active*`);
  for (const w of checkedIn) {
    lines.push(`   ✅ ${w.name}`);
  }
  for (const w of notCheckedIn) {
    lines.push(`   ❌ ${w.name} (not checked in)`);
  }
  lines.push("");

  // Inventory alerts
  const inventoryItems = data.inventory ?? [];
  const stockAlerts = data.stock_alerts ?? [];
  const alertedIds = new Set(stockAlerts.map((a: any) => a.inventory_id));
  const belowThreshold = inventoryItems.filter(
    (i: any) => i.current_stock < i.minimum_threshold
  );
  const allAlerts = [
    ...stockAlerts.map((a: any) => a.inventory),
    ...belowThreshold.filter((i: any) => !alertedIds.has(i.id)),
  ].filter(Boolean);
  if (allAlerts.length > 0) {
    lines.push(`⚠️ *Inventory Alerts: ${allAlerts.length}*`);
    for (const item of allAlerts.slice(0, 5)) {
      lines.push(`   • ${item.item_name} — ${item.current_stock}${item.unit} remaining`);
    }
    lines.push("");
  }

  // Reminders
  const reminders = data.reminders ?? [];
  if (reminders.length > 0) {
    lines.push(`🔔 *Service Reminders Due: ${reminders.length}*`);
    for (const r of reminders.slice(0, 5)) {
      const name = r.customers?.name ?? "Unknown";
      lines.push(`   • ${name}`);
    }
    lines.push("");
  }

  // Support tickets
  const openTickets = data.openTickets ?? 0;
  lines.push(`🎫 *Open Support Tickets: ${openTickets}*`);
  lines.push("");

  // Insights
  const totalJobs = jobs.length;
  const workload = totalJobs > 5 ? "High" : totalJobs > 2 ? "Medium" : "Low";
  lines.push(`💡 *Insights*`);
  lines.push(`   Workload: ${workload}`);
  if (notCheckedIn.length > 0) {
    lines.push(`   ⚠️ ${notCheckedIn.length} worker(s) not checked in`);
  }
  if (allAlerts.length > 0) {
    lines.push(`   ⚠️ ${allAlerts.length} inventory item(s) below threshold`);
  }
  lines.push("");
  lines.push("✅ Open AquaTrak for full details.");

  return lines.join("\n");
}

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

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const [cardsRes, staffRes, attendanceRes, inventoryRes, stockAlertsRes, remindersPipelineRes, ticketsRes, merchantRes] =
      await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/service_cards?select=*,customers(*),staff(*)&merchant_id=eq.${MERCHANT_ID}`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/staff?select=*&merchant_id=eq.${MERCHANT_ID}&is_active=eq.true`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/attendance?select=*,staff(*)&date=eq.${today}&merchant_id=eq.${MERCHANT_ID}&checkin_time=not.is.null`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/inventory?select=*&merchant_id=eq.${MERCHANT_ID}`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/stock_alerts?select=*,inventory(*)&merchant_id=eq.${MERCHANT_ID}&resolved=eq.false`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/reminder_responses?select=*&merchant_id=eq.${MERCHANT_ID}`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/support_tickets?select=id&status=eq.open`,
          { headers }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`,
          { headers }
        ),
      ]);

    const allCards = await cardsRes.json();
    const staff = await staffRes.json();
    const attendance = await attendanceRes.json();
    const inventory = await inventoryRes.json();
    const stockAlerts = await stockAlertsRes.json();
    const remindersRaw = await remindersPipelineRes.json();
    const ticketsData = await ticketsRes.json();
    const merchantData = await merchantRes.json();

    // Filter for today's jobs
    const jobs = Array.isArray(allCards)
      ? allCards.filter((c: any) => c.service_date === today)
      : [];

    // Derive reminders from canonical pipeline
    const cards = Array.isArray(allCards) ? allCards : [];
    const reminders = Array.isArray(remindersRaw) ? remindersRaw : [];
    const customerIds = [...new Set(cards.map((c: any) => c.customer_id))];
    const pipelineResults = customerIds.length > 0
      ? evaluateCustomerAttentionBatch({
          serviceCards: cards,
          reminders,
          customerId: customerIds[0],
          merchantId: MERCHANT_ID,
          today: new Date(),
        }, customerIds)
      : new Map();

    const reminderEntries: { customers: { name: string } }[] = [];
    for (const [, result] of pipelineResults) {
      if (result.reminderEligible) {
        reminderEntries.push({ customers: { name: result.customerName } });
      }
    }

    const openTickets = Array.isArray(ticketsData) ? ticketsData.length : 0;
    const merchantPhone = Array.isArray(merchantData) && merchantData.length > 0
      ? merchantData[0].phone
      : null;

    const payload = { jobs, staff, attendance, inventory, stock_alerts: stockAlerts, reminders: reminderEntries, openTickets };
    const briefingText = buildBriefingText(payload, today);

    let whatsappSent = false;
    if (openwaConfig.apiKey && openwaConfig.sessionId && merchantPhone) {
      const result = await sendWhatsAppMessage(openwaConfig, merchantPhone, briefingText);
      whatsappSent = result.ok;
    }

    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "daily_briefing",
        status: "success",
        error_message: whatsappSent ? null : "OpenWA not configured or merchant phone unavailable",
      }),
    });

    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(
      JSON.stringify({
        briefing: briefingText,
        whatsappSent,
        date: today,
        summary: {
          jobs: jobs.length,
          workers: staff.length,
          checkedIn: attendance.length,
          alerts: (stockAlerts.length +
            inventory.filter((i: any) => i.current_stock < i.minimum_threshold).length),
          reminders: reminderEntries.length,
          openTickets,
        },
      })
    );
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ error: err.message }));
  }
}
