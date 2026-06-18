import {
  getOpenWAConfig,
  sendWhatsAppMessage,
  extractPhoneFromOpenWA,
  resolveLidToPhone,
} from "../lib/openwa.js";

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
      const config = getOpenWAConfig();
      console.log(`[webhook] Config: baseUrl=${config.baseUrl}, sessionId=${config.sessionId}, apiKey=${config.apiKey ? "set" : "MISSING"}`);

      const supabaseUrl = process.env.SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      };

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

      const fromJid = data.from;
      const messageBody = data.body ?? "";
      const location = data.location;
      const isLid = fromJid.includes("@lid");
      let phone = isLid ? null : extractPhoneFromOpenWA(fromJid);
      let replyTo = fromJid;

      if (isLid && !phone) {
        console.log(`[webhook] LID detected: ${fromJid}, resolving to phone...`);
        phone = await resolveLidToPhone(config, fromJid);
        if (phone) {
          replyTo = `91${phone}@c.us`;
        }
        console.log(`[webhook] Resolved phone: ${phone}, replyTo: ${replyTo}`);
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
        if (location?.latitude && location?.longitude) {
          await replyViaOpenWA(replyTo, "You are not registered as staff. Contact your manager.");
        } else {
          console.log(`[webhook] No staff found for ${fromJid} (phone=${phone}). Handling as FAQ.`);
          const faqResult = await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
          console.log(`[webhook] FAQ result:`, faqResult);
        }
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "processed" }));
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
          res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ status: "no_job" }));
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
        } else {
          await handleFAQ(replyTo, phone ?? replyTo, messageBody, supabaseUrl, headers);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ status: "processed" }));
      return;
    } catch (err: any) {
      console.error("Webhook error:", err);
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ status: "error", error: err.message }));
      return;
    }
  }

  res.writeHead(405, corsHeaders);
  res.end("Method not allowed");
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
  return sendWhatsAppMessage(config, to, text);
}

async function handleFAQ(
  replyTo: string,
  identifier: string,
  message: string,
  supabaseUrl: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const mistralModel = process.env.MISTRAL_MODEL ?? "mistral-large-latest";
  const sanitized = message.replace(/[^a-zA-Z0-9\s?!,.]/g, "").slice(0, 500);

  console.log(`[faq] replyTo=${replyTo}, message=${sanitized}`);

  if (!mistralKey) {
    console.log("[faq] No MISTRAL_API_KEY, sending fallback");
    const r = await replyViaOpenWA(replyTo, "Thanks for reaching out! Our team will get back to you shortly.");
    return r;
  }

  try {
    const aiRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: mistralModel,
        messages: [
          {
            role: "system",
            content: `You are a friendly customer support assistant for AquaClean Services — a water tank cleaning business. You help customers with ANY question about our services. Here is what we offer:\n\nServices & Pricing:\n- Water tank cleaning (standard): 500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800\n- Deep cleaning: 30% above standard rates\n- Sofa cleaning: per seat Rs.500, full sofa set Rs.1500\n- Car seats cleaning: per seat Rs.300, full car interior Rs.2000\n- Carpet cleaning: starting at Rs.600\n\nWorking hours: Monday to Saturday, 8:00 AM to 6:00 PM\nTank capacity formula: length x width x height (in meters) x 1000 = liters\nService interval: Every 6 months recommended\n\nRules:\n- Be helpful, friendly, and professional\n- Answer ANY question the customer has about our services\n- If asked about something completely unrelated to our services, politely redirect to our services\n- Keep answers under 80 words\n- You can use emojis occasionally`,
          },
          { role: "user", content: sanitized },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    const aiData = await aiRes.json();
    const aiResponse = aiData?.choices?.[0]?.message?.content?.trim();
    console.log(`[faq] AI response length=${aiResponse?.length}`);
    const r = await replyViaOpenWA(replyTo, aiResponse ?? "Thanks for your message! Our team will get back to you shortly.");
    return r;
  } catch (err: any) {
    console.error("[faq] Error:", err.message);
    const r = await replyViaOpenWA(replyTo, "Thanks for your message! Our team will get back to you shortly.");
    return r;
  }
}
