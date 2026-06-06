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

  const url = new URL(req.url);
  const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "aquatrak_verify";

  // GET: Webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST: Incoming message handler
  if (req.method === "POST") {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const whatsappToken = Deno.env.get("WHATSAPP_TOKEN") ?? "";
      const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      };

      const body = await req.json();

      // Extract message data from WhatsApp webhook payload
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];
      const fromPhone = message?.from;

      if (!message || !fromPhone) {
        return new Response(
          JSON.stringify({ status: "no_message" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Look up staff by phone
      const staffRes = await fetch(
        `${supabaseUrl}/rest/v1/staff?phone=eq.${fromPhone}&is_active=eq.true&select=*`,
        { headers }
      );
      const staff = await staffRes.json();

      if (!Array.isArray(staff) || staff.length === 0) {
        await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "You are not registered as staff. Contact your manager.");
        return new Response(
          JSON.stringify({ status: "not_staff" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const staffMember = staff[0];

      // Handle location message (check-in)
      if (message.type === "location") {
        const lat = message.location.latitude;
        const lng = message.location.longitude;

        // Get today's job site
        const today = new Date().toISOString().slice(0, 10);
        const jobRes = await fetch(
          `${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`,
          { headers }
        );
        const jobs = await jobRes.json();

        if (!Array.isArray(jobs) || jobs.length === 0) {
          await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "No job assigned for today. Contact your manager.");
          return new Response(
            JSON.stringify({ status: "no_job" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
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
          // No coordinates on customer, allow check-in without verification
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
            await fetch(
              `${supabaseUrl}/rest/v1/attendance?id=eq.${att[0].id}`,
              {
                method: "PATCH",
                headers,
                body: JSON.stringify({ checkout_time: new Date().toISOString() }),
              }
            );
            await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "Checked out. Good work today!");
          } else {
            await sendWhatsAppReply(phoneNumberId, whatsappToken, fromPhone, "No active check-in found for today.");
          }
        } else {
          // Forward non-checkout text to AI FAQ handler
          await handleFAQ(phoneNumberId, whatsappToken, fromPhone, message.text?.body ?? "", supabaseUrl, headers);
        }
      }

      return new Response(
        JSON.stringify({ status: "processed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

// Haversine distance formula
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

// Send WhatsApp text reply
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

// Handle FAQ via Gemini
async function handleFAQ(
  phoneNumberId: string,
  whatsappToken: string,
  fromPhone: string,
  message: string,
  supabaseUrl: string,
  headers: Record<string, string>
) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

  if (!geminiApiKey) {
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
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a customer support assistant for AquaClean Services, a water tank cleaning service. You can ONLY answer questions about: 1) Pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Working hours (Mon-Sat, 8AM-6PM), 3) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Do not add any other text if escalating. Keep answers under 50 words. Be friendly and professional.\n\nCustomer question: ${sanitized}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const aiResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "ESCALATE";

    if (aiResponse === "ESCALATE") {
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
