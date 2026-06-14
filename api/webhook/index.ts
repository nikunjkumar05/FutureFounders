import {
  getTwilioConfig,
  sendTwilioMessage,
  extractPhoneFromTwilio,
} from "../lib/twilio.js";

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

  // GET: Twilio webhook verification (Twilio sends a test request)
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain", ...corsHeaders });
    res.end("AquaTrak webhook is running");
    return;
  }

  // POST: Incoming Twilio webhook
  if (req.method === "POST") {
    try {
      const supabaseUrl = process.env.SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      };

      // Parse Twilio's URL-encoded body
      let rawBody = "";
      for await (const chunk of req) {
        rawBody += chunk;
      }
      const params = new URLSearchParams(rawBody);
      const body: Record<string, string> = {};
      params.forEach((value, key) => {
        body[key] = value;
      });

      const fromPhone = body.From;
      const messageBody = body.Body ?? "";
      const latitude = body.Latitude;
      const longitude = body.Longitude;

      if (!fromPhone) {
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "no_sender" }));
        return;
      }

      // Extract phone number (remove whatsapp: prefix and + sign)
      const phone = extractPhoneFromTwilio(fromPhone);

      // Look up staff by phone
      const staffRes = await fetch(
        `${supabaseUrl}/rest/v1/staff?phone=eq.${phone}&is_active=eq.true&select=*`,
        { headers }
      );
      const staff = await staffRes.json();

      if (!Array.isArray(staff) || staff.length === 0) {
        // Non-staff: route text messages to AI FAQ
        if (latitude && longitude) {
          await replyViaTwilio(fromPhone, "You are not registered as staff. Contact your manager.");
        } else {
          await handleFAQ(phone, messageBody, supabaseUrl, headers);
        }
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "processed" }));
        return;
      }

      const staffMember = staff[0];

      // Handle location message (check-in)
      if (latitude && longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        const today = new Date().toISOString().slice(0, 10);
        const jobRes = await fetch(
          `${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`,
          { headers }
        );
        const jobs = await jobRes.json();

        if (!Array.isArray(jobs) || jobs.length === 0) {
          await replyViaTwilio(fromPhone, "No job assigned for today. Contact your manager.");
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
            await replyViaTwilio(
              fromPhone,
              `Check-in confirmed at ${job.customers?.address ?? "job site"}! Have a great shift.`
            );
          } else {
            await replyViaTwilio(
              fromPhone,
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
          await replyViaTwilio(fromPhone, "Check-in recorded. No site coordinates available for verification.");
        }

        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ status: "processed" }));
        return;
      }

      // Handle text messages
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
          await replyViaTwilio(fromPhone, "Checked out. Good work today!");
        } else {
          await replyViaTwilio(fromPhone, "No active check-in found for today.");
        }
      } else {
        // Forward non-checkout text to AI FAQ handler
        await handleFAQ(phone, messageBody, supabaseUrl, headers);
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

async function replyViaTwilio(to: string, text: string) {
  const config = getTwilioConfig();
  await sendTwilioMessage(config, to, text);
}

async function handleFAQ(
  phone: string,
  message: string,
  supabaseUrl: string,
  headers: Record<string, string>
) {
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const mistralModel = process.env.MISTRAL_MODEL ?? "mistral-large-latest";

  const sanitized = message.replace(/[^a-zA-Z0-9\s?!,.]/g, "").slice(0, 500);

  if (!mistralKey) {
    await replyViaTwilio(phone, "Thanks for reaching out! Our team will get back to you shortly.");
    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ customer_phone: phone, message, requires_human_intervention: true, status: "open" }),
    });
    return;
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

    if (aiResponse) {
      await replyViaTwilio(phone, aiResponse);
    } else {
      await replyViaTwilio(phone, "Thanks for your message! Our team will get back to you shortly.");
    }

    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer_phone: phone,
        message: sanitized,
        ai_response: aiResponse ?? null,
        requires_human_intervention: !aiResponse,
        status: aiResponse ? "auto_resolved" : "open",
      }),
    });
  } catch {
    await replyViaTwilio(phone, "Thanks for your message! Our team will get back to you shortly.");
    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer_phone: phone,
        message: sanitized,
        requires_human_intervention: true,
        status: "open",
      }),
    });
  }
}
