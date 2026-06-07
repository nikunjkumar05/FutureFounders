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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { message, phone } = await req.json();
    if (!message || !phone) {
      return new Response(
        JSON.stringify({ error: "message and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const sanitized = message.replace(/[^a-zA-Z0-9\s?!,.]/g, "").slice(0, 500);

    if (!geminiApiKey) {
      await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          customer_phone: phone,
          message: sanitized,
          requires_human_intervention: true,
          status: "open",
        }),
      });

      return new Response(
        JSON.stringify({
          escalated: true,
          reply: "I've connected you with our team — they'll respond within 2 hours!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
                  text: `You are a customer support assistant for AquaClean Services. We offer water tank cleaning, sofa cleaning, and car seats cleaning. You can ONLY answer questions about: 1) Tank cleaning pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Sofa cleaning pricing (per seat: Rs.500, full sofa set: Rs.1500), 3) Car seats cleaning pricing (per seat: Rs.300, full car interior: Rs.2000), 4) Working hours (Mon-Sat, 8AM-6PM), 5) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Do not add any other text if escalating. Keep answers under 50 words. Be friendly and professional.\n\nCustomer question: ${sanitized}`,
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
      await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          customer_phone: phone,
          message: sanitized,
          ai_response: null,
          requires_human_intervention: true,
          status: "open",
        }),
      });

      return new Response(
        JSON.stringify({
          escalated: true,
          reply: "I've connected you with our team — they'll respond within 2 hours!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await fetch(`${supabaseUrl}/rest/v1/support_tickets`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        customer_phone: phone,
        message: sanitized,
        ai_response: aiResponse,
        requires_human_intervention: false,
        status: "auto_resolved",
      }),
    });

    return new Response(
      JSON.stringify({ escalated: false, reply: aiResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
