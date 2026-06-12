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

  const url = new URL(req.url, `http://${req.headers.host}`);
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "operation_overflow_app_verify";

  // GET: Webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      res.writeHead(200, { "Content-Type": "text/plain", ...corsHeaders });
      res.end(challenge);
      return;
    }
    res.writeHead(403, corsHeaders);
    res.end("Forbidden");
    return;
  }

  // POST: Incoming message handler
  if (req.method === "POST") {
    try {
      const supabaseUrl = process.env.SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const whatsappToken = process.env.WHATSAPP_TOKEN ?? "";
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      };

      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const parsed = JSON.parse(body);

      // Extract message data from WhatsApp webhook payload
      const entry = parsed.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];
      const fromPhone = message?.from;

      if (!message || !fromPhone) {
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "no_message" }));
        return;
      }

      // Look up staff by phone
      const staffRes = await fetch(
        `${supabaseUrl}/rest/v1/staff?phone=eq.${fromPhone}&is_active=eq.true&select=*`,
        { headers }
      );
      const staff = await staffRes.json();

      if (!Array.isArray(staff) || staff.length === 0) {
        await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "You are not registered as staff. Contact your manager.");
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "not_staff" }));
        return;
      }

      const staffMember = staff[0];

      // Handle location message (check-in)
      if (message.type === "location") {
        const lat = message.location.latitude;
        const lng = message.location.longitude;

        const today = new Date().toISOString().slice(0, 10);
        const jobRes = await fetch(
          `${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`,
          { headers }
        );
        const jobs = await jobRes.json();

        if (!Array.isArray(jobs) || jobs.length === 0) {
          await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "No job assigned for today. Contact your manager.");
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
            await sendWhatsAppReply(
              phoneNumberId, whatsappToken, fromPhone,
              `Check-in confirmed at ${job.customers?.address ?? "job site"}! Have a great shift.`
            );
          } else {
            await sendWhatsAppReply(
              phoneNumberId, whatsappToken, fromPhone,
              `You're ${distance}m away from the job site. Please share your location once you arrive.`
            );
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
          await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "Check-in recorded. No site coordinates available for verification.");
        }
      }

      // Handle text "checkout"
      if (message.type === "text") {
        const text = message.text?.body?.toLowerCase().trim();
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
            await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "Checked out. Good work today!");
          } else {
            await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "No active check-in found for today.");
          }
        } else {
          await handleFAQ(phoneNumberId, whatsappToken, fromPhone, message.text?.body ?? "", supabaseUrl, headers);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ status: "processed" }));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: err.message }));
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

async function sendWhatsAppReply(
  phoneNumberId: string,
  token: string,
  to: string,
  text: string
) {
  if (!token || !phoneNumberId) return;
  await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

async function handleFAQ(
  phoneNumberId: string,
  whatsappToken: string,
  fromPhone: string,
  message: string,
  supabaseUrl: string,
  headers: Record<string, string>
) {
  const aiApiKey = process.env.NORTH_MINI_API_KEY ?? "";

  if (!aiApiKey) {
    await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer_phone: fromPhone,
        message,
        requires_human_intervention: true,
        status: "open",
      }),
    });
    return;
  }

  const sanitized = message.replace(/[^a-zA-Z0-9\s?!,.]/g, "").slice(0, 500);

  try {
    const aiRes = await fetch("https://api.northmini.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "north-mini",
        messages: [
          {
            role: "system",
            content: "You are a customer support assistant for AquaClean Services. We offer water tank cleaning, sofa cleaning, and car seats cleaning. You can ONLY answer questions about: 1) Tank cleaning pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Sofa cleaning pricing (per seat: Rs.500, full sofa set: Rs.1500), 3) Car seats cleaning pricing (per seat: Rs.300, full car interior: Rs.2000), 4) Working hours (Mon-Sat, 8AM-6PM), 5) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Do not add any other text if escalating. Keep answers under 50 words. Be friendly and professional.",
          },
          { role: "user", content: sanitized },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const aiData = await aiRes.json();
    const aiResponse = aiData?.choices?.[0]?.message?.content?.trim() ?? "ESCALATE";

    if (aiResponse.startsWith("ESCALATE")) {
      await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
      await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer_phone: fromPhone,
          message: sanitized,
          ai_response: null,
          requires_human_intervention: true,
          status: "open",
        }),
      });
    } else {
      await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, aiResponse);
      await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer_phone: fromPhone,
          message: sanitized,
          ai_response: aiResponse,
          requires_human_intervention: false,
          status: "auto_resolved",
        }),
      });
    }
  } catch {
    await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer_phone: fromPhone,
        message: sanitized,
        requires_human_intervention: true,
        status: "open",
      }),
    });
  }
}