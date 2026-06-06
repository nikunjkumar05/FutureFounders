import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const { ticketId } = await req.json();
    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: "ticketId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const whatsappToken = Deno.env.get("WHATSAPP_TOKEN") ?? "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    // Fetch ticket
    const ticketRes = await fetch(
      `${supabaseUrl}/rest/v1/support_tickets?id=eq.${ticketId}&select=*`,
      { headers: dbHeaders }
    );
    const tickets = await ticketRes.json();
    const ticket = Array.isArray(tickets) ? tickets[0] : null;

    if (!ticket) {
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to resolved
    await fetch(
      `${supabaseUrl}/rest/v1/support_tickets?id=eq.${ticketId}`,
      {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ status: "resolved" }),
      }
    );

    // Send WhatsApp reply
    if (whatsappToken && phoneNumberId && ticket.customer_phone) {
      await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${whatsappToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: `91${ticket.customer_phone}`,
            type: "text",
            text: {
              body: "Hi! Your query has been resolved by our team. Let us know if you need anything else!",
            },
          }),
        }
      );
    }

    return new Response(
      JSON.stringify({ status: "resolved", customer_phone: ticket.customer_phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
