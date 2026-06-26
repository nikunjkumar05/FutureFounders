import {
  getOpenWAConfig,
  extractPhoneFromOpenWA,
} from "../lib/openwa.js";
import { sendWithRetry } from "../lib/retry.js";
import { log } from "../lib/logger.js";

const COMPONENT = "webhook";
const MERCHANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

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

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain", ...corsHeaders });
    res.end("AquaTrak webhook is running");
    return;
  }

  if (req.method === "POST") {
    try {
      let rawBody = "";
      for await (const chunk of req) {
        rawBody += chunk;
      }

      const payload = JSON.parse(rawBody);
      const event = payload.event;
      const data = payload.data;

      if (event !== "message.received" || !data || data.fromMe) {
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "ignored" }));
        return;
      }

      try {
        await processMessage(payload);
      } catch (err: any) {
        console.error("[webhook] processMessage error:", err?.message ?? err);
      }

      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ status: "processed" }));
      return;
    } catch (err: any) {
      console.error("Webhook parse error:", err);
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ status: "error", error: err.message }));
      return;
    }
  }

  res.writeHead(405, corsHeaders);
  res.end("Method not allowed");
}

async function processMessage(payload: any) {
  const config = getOpenWAConfig();
  log.info(COMPONENT, "Processing message", {
    baseUrl: config.baseUrl,
    sessionId: config.sessionId,
    apiKeySet: !!config.apiKey,
  });

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Idempotency check
  const idempotencyKey = payload.idempotencyKey;
  if (idempotencyKey) {
    try {
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/webhook_idempotency?key=eq.${encodeURIComponent(idempotencyKey)}&select=key`,
        { headers }
      );
      const rows = await existing.json();
      if (Array.isArray(rows) && rows.length > 0) {
        log.info(COMPONENT, "Duplicate message skipped", { idempotencyKey });
        return;
      }
    } catch (err: any) {
      log.warn(COMPONENT, "Idempotency check failed, continuing", { error: err.message });
    }
  }

  const data = payload.data;
  const fromJid = data.from;
  const messageBody = data.body ?? "";
  const location = data.location;
  const isLid = fromJid.includes("@lid");
  let phone = isLid ? null : extractPhoneFromOpenWA(fromJid);
  let replyTo = fromJid;

  if (isLid) {
    console.log(`[webhook] LID detected: ${fromJid}, using LID directly as replyTo`);
  }

  let staff = null;
  if (phone) {
    const staffRes = await fetch(
      `${supabaseUrl}/rest/v1/staff?phone=eq.${phone}&is_active=eq.true&select=*`,
      { headers }
    );
    const staffData = await staffRes.json();
    if (Array.isArray(staffData) && staffData.length > 0) {
      staff = staffData[0];
    }
  }

  if (!staff) {
    let customer = null;
    if (phone) {
      const customerRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?phone=eq.${phone}&select=*`,
        { headers }
      );
      const customerData = await customerRes.json();
      if (Array.isArray(customerData) && customerData.length > 0) {
        customer = customerData[0];
      }
    }

    if (customer) {
      const text = messageBody.toLowerCase().trim();
      if (text === "yes" || text === "confirm" || text === "haan") {
        const remsRes = await fetch(
          `${supabaseUrl}/rest/v1/reminder_responses?customer_id=eq.${customer.id}&status=eq.sent&order=created_at.desc&limit=1`,
          { headers }
        );
        const rems = await remsRes.json();
        if (Array.isArray(rems) && rems.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/reminder_responses?id=eq.${rems[0].id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              status: "responded",
              responded_at: new Date().toISOString(),
              response: messageBody
            })
          });
        }
        await replyViaOpenWA(replyTo, "Namaste! Cleaning book karne ke liye dhanyavad. Kripya timing select karein: 'Morning' (8AM-1PM) ya 'Afternoon' (1PM-6PM)?");
      } else if (text.includes("morning") || text.includes("afternoon")) {
        const remsRes = await fetch(
          `${supabaseUrl}/rest/v1/reminder_responses?customer_id=eq.${customer.id}&status=eq.responded&order=created_at.desc&limit=1`,
          { headers }
        );
        const rems = await remsRes.json();
        if (Array.isArray(rems) && rems.length > 0) {
          const slot = text.includes("morning") ? "morning" : "afternoon";
          const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

          const serviceDetails = {
            services: [
              {
                serviceType: "standard_cleaning",
                items: [
                  {
                    id: "item-auto",
                    quantity: 1,
                    price: 1200,
                    capacity: customer.tank_capacity_liters || 1000
                  }
                ],
                totalPrice: 1200
              }
            ],
            totalCharge: 1200,
            tankCount: 1,
            tankCapacity: customer.tank_capacity_liters || 1000,
            totalCapacity: customer.tank_capacity_liters || 1000,
            serviceType: "standard_cleaning"
          };

          await fetch(`${supabaseUrl}/rest/v1/service_cards`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              customer_id: customer.id,
              merchant_id: customer.merchant_id,
              service_type: "standard_cleaning",
              service_date: tomorrow,
              job_status: "pending",
              notes: `Auto-booked via WhatsApp reply (${slot} slot)`,
              service_details: serviceDetails
            })
          });

          await fetch(`${supabaseUrl}/rest/v1/reminder_responses?id=eq.${rems[0].id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "booked" })
          });

          await replyViaOpenWA(replyTo, `Dhanyavad! Aapki service kal (${tomorrow}) ${slot} slot ke liye book ho chuki hai. Humara staff scheduled samay par pahunch jayega.`);
        } else {
          await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
        }
      } else {
        await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
      }
    } else {
      if (location?.latitude && location?.longitude) {
        await replyViaOpenWA(replyTo, "You are not registered as staff. Contact your manager.");
      } else {
        console.log(`[webhook] No staff/customer found for ${fromJid} (phone=${phone}). Handling as FAQ.`);
        const faqResult = await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
        console.log(`[webhook] FAQ result:`, faqResult);
      }
    }
    return;
  }

  const staffMember = staff;

  if (location?.latitude && location?.longitude) {
    const lat = location.latitude;
    const lng = location.longitude;
    const today = new Date().toISOString().slice(0, 10);
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`,
      { headers }
    );
    const jobs = await jobRes.json();

    if (!Array.isArray(jobs) || jobs.length === 0) {
      await replyViaOpenWA(replyTo, "No job assigned for today. Contact your manager.");
      return;
    }

    const job = jobs[0];
    const siteLat = job.customers?.latitude;
    const siteLng = job.customers?.longitude;

    if (siteLat && siteLng) {
      const distance = getDistance(lat, lng, siteLat, siteLng);
      const verified = distance <= 100;
      await fetch(`${supabaseUrl}/rest/v1/attendance`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          staff_id: staffMember.id,
          merchant_id: staffMember.merchant_id,
          checkin_time: new Date().toISOString(),
          verified_location: verified,
          date: today,
          notes: verified ? "Auto check-in via WhatsApp" : `Location ${distance}m from site`,
        }),
      });
      if (verified) {
        await replyViaOpenWA(replyTo, `Check-in confirmed at ${job.customers?.address ?? "job site"}! Have a great shift.`);
      } else {
        await replyViaOpenWA(replyTo, `You're ${distance}m away from the job site. Please share your location once you arrive.`);
      }
    } else {
      await fetch(`${supabaseUrl}/rest/v1/attendance`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          staff_id: staffMember.id,
          merchant_id: staffMember.merchant_id,
          checkin_time: new Date().toISOString(),
          verified_location: false,
          date: today,
          notes: "Check-in — no site coordinates available",
        }),
      });
      await replyViaOpenWA(replyTo, "Check-in recorded. No site coordinates available for verification.");
    }
  } else {
    const text = messageBody.toLowerCase().trim();
    if (text === "checkout") {
      const today = new Date().toISOString().slice(0, 10);
      const attRes = await fetch(
        `${supabaseUrl}/rest/v1/attendance?staff_id=eq.${staffMember.id}&date=eq.${today}&checkout_time=is.null&select=id`,
        { headers }
      );
      const att = await attRes.json();
      if (Array.isArray(att) && att.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/attendance?id=eq.${att[0].id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ checkout_time: new Date().toISOString() }),
        });
        await replyViaOpenWA(replyTo, "Checked out. Good work today!");
      } else {
        await replyViaOpenWA(replyTo, "No active check-in found for today.");
      }
    } else if (text === "done" || text === "completed" || text === "complete") {
      const today = new Date().toISOString().slice(0, 10);
      const activeJobRes = await fetch(
        `${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&job_status=neq.completed&select=*,customers(*)`,
        { headers }
      );
      const activeJobs = await activeJobRes.json();
      if (Array.isArray(activeJobs) && activeJobs.length > 0) {
        const job = activeJobs[0];
        await fetch(`${supabaseUrl}/rest/v1/service_cards?id=eq.${job.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ job_status: "completed" }),
        });
        await replyViaOpenWA(replyTo, "Job completed! Inventory levels updated automatically.");

        const customerPhone = job.customers?.phone;
        const customerName = job.customers?.name;
        const details = job.service_details || {};
        const amount = details.totalCharge || 1200;

        if (customerPhone) {
          const upiUrl = `upi://pay?pa=9876543210@okbizaxis&pn=AquaClean&am=${amount}&cu=INR`;
          const payMessage = `Namaste ${customerName}! AquaClean Services se tank cleaning poori ho chuki hai. Kripya ₹${amount} ka payment is link ke zariye karein: ${upiUrl}`;
          await replyViaOpenWA(`91${customerPhone}@c.us`, payMessage);
        }
      } else {
        await replyViaOpenWA(replyTo, "No active job found for today to mark as DONE.");
      }
    } else {
      await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
    }
  }

  // Record idempotency key
  if (idempotencyKey) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ key: idempotencyKey }),
      });
      // Cleanup old keys (1 in 100 requests)
      if (Math.random() < 0.01) {
        await fetch(
          `${supabaseUrl}/rest/v1/rpc/cleanup_idempotency_keys`,
          { method: "POST", headers }
        );
      }
    } catch (err: any) {
      log.warn(COMPONENT, "Failed to record idempotency key", { error: err.message });
    }
  }
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

async function replyViaOpenWA(to: string, text: string) {
  const config = getOpenWAConfig();
  return sendWithRetry(config, to, text);
}

async function handleFAQ(
  replyTo: string,
  _identifier: string,
  message: string,
  supabaseUrl: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const mistralModel = process.env.MISTRAL_MODEL ?? "mistral-large-latest";
  const sanitized = message.replace(/[<>]/g, "").slice(0, 500);
  const phone = _identifier.replace(/@.*$/, "");

  log.info(COMPONENT, "FAQ request received", { replyTo, messageLength: sanitized.length });

  if (!mistralKey) {
    log.warn(COMPONENT, "No MISTRAL_API_KEY, sending fallback");
    const fallback = "Thanks for reaching out! Our team will get back to you shortly.";
    await createSupportTicket(supabaseUrl, headers, phone, sanitized, fallback, false);
    const r = await sendWithRetry(getOpenWAConfig(), replyTo, fallback);
    return r;
  }

  try {
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 15000);
    const aiRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      signal: aiController.signal,
      body: JSON.stringify({
        model: mistralModel,
        messages: [
          {
            role: "system",
            content: `You are a friendly customer support assistant for AquaClean Services — a water tank cleaning business. You help customers with ANY question about our services.\n\nServices & Pricing:\n- Water tank cleaning (standard): 500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800\n- Deep cleaning: 30% above standard rates\n- Sofa cleaning: per seat Rs.500, full sofa set Rs.1500\n- Car seats cleaning: per seat Rs.300, full car interior Rs.2000\n- Carpet cleaning: starting at Rs.600\n\nWorking hours: Monday to Saturday, 8:00 AM to 6:00 PM\nTank capacity formula: length x width x height (in meters) x 1000 = liters\nService interval: Every 6 months recommended\n\nRules:\n- Be helpful, friendly, and professional\n- Answer ANY question the customer has about our services\n- The customer may write in Hindi (Devanagari script) or Roman Hindi (Hinglish). Respond in the same language they use\n- If asked about something completely unrelated to our services, respond with exactly: ESCALATE\n- Keep answers under 80 words\n- You can use emojis occasionally`,
          },
          { role: "user", content: sanitized },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    clearTimeout(aiTimeout);
    const aiData = await aiRes.json();
    const aiResponse = aiData?.choices?.[0]?.message?.content?.trim();
    const isEscalated = aiResponse === "ESCALATE";
    const finalResponse = isEscalated
      ? "Thanks for your message! Our team will get back to you shortly."
      : (aiResponse ?? "Thanks for your message! Our team will get back to you shortly.");

    log.info(COMPONENT, "FAQ response generated", {
      responseLength: finalResponse.length,
      escalated: isEscalated,
    });

    await createSupportTicket(supabaseUrl, headers, phone, sanitized, finalResponse, isEscalated);
    const r = await sendWithRetry(getOpenWAConfig(), replyTo, finalResponse);
    return r;
  } catch (err: any) {
    log.error(COMPONENT, "FAQ error", { error: err.message });
    const fallback = "Thanks for your message! Our team will get back to you shortly.";
    await createSupportTicket(supabaseUrl, headers, phone, sanitized, fallback, true);
    const r = await sendWithRetry(getOpenWAConfig(), replyTo, fallback);
    return r;
  }
}

async function createSupportTicket(
  supabaseUrl: string,
  headers: Record<string, string>,
  phone: string,
  message: string,
  aiResponse: string,
  requiresHuman: boolean
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_phone: phone,
        message,
        ai_response: aiResponse,
        requires_human_intervention: requiresHuman,
        status: requiresHuman ? "open" : "auto_resolved",
        merchant_id: MERCHANT_ID,
      }),
    });
  } catch (err: any) {
    log.error(COMPONENT, "Failed to create support ticket", { error: err.message });
  }
}
