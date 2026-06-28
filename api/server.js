import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env only if not in Azure (Azure uses App Settings)
if (!process.env.WEBSITE_SITE_NAME) {
  try {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getOpenWAConfig() {
  return {
    baseUrl: process.env.OPENWA_API_URL ?? 'http://localhost:2785',
    apiKey: process.env.OPENWA_API_KEY ?? '',
    sessionId: process.env.OPENWA_SESSION_ID ?? '',
  };
}

function toJID(phone) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) return `91${cleaned.slice(1)}@c.us`;
  if (cleaned.startsWith('+')) return `${cleaned.slice(1)}@c.us`;
  if (cleaned.startsWith('91') && cleaned.length === 12) return `${cleaned}@c.us`;
  return `${cleaned}@c.us`;
}

async function sendOpenWAMessage(config, to, body) {
  if (!config.apiKey || !config.sessionId) {
    console.log('[OPENWA] No credentials, skipping');
    return { ok: false, error: 'No credentials' };
  }
  const chatId = to.includes('@') ? to : toJID(to);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ chatId, text: body }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errorText = await res.text();
      console.log('[OPENWA ERROR]', errorText);
      return { ok: false, error: errorText };
    }
    const data = await res.json();
    console.log('[OPENWA] Sent to', chatId);
    return { ok: true, messageId: data.messageId };
  } catch (err) {
    console.log('[OPENWA] Exception:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendWithRetry(config, to, body, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendOpenWAMessage(config, to, body);
    if (result.ok) return result;
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, Math.pow(3, attempt - 1) * 1000));
    }
  }
  return { ok: false, error: 'All retries failed' };
}

function extractPhone(from) {
  let phone = from.split('@')[0];
  if (phone.startsWith('91') && phone.length === 12) return phone.slice(2);
  return phone;
}

const lidCache = new Map();

async function resolveLidToPhone(config, lidJid) {
  if (lidCache.has(lidJid)) return lidCache.get(lidJid);
  if (!config.apiKey || !config.sessionId) return null;
  try {
    const url = `${config.baseUrl}/api/sessions/${config.sessionId}/contacts/${encodeURIComponent(lidJid)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: { 'X-API-Key': config.apiKey, 'ngrok-skip-browser-warning': 'true' }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contact = await res.json();
    if (contact?.id && contact.id.includes('@c.us')) {
      const phone = extractPhone(contact.id);
      if (phone) lidCache.set(lidJid, phone);
      return phone;
    }
    return null;
  } catch {
    return null;
  }
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getSupabaseHeaders() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    supabaseUrl,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
  };
}

async function handleFAQ(supabaseUrl, headers, openwaConfig, fromPhone, phone, messageBody) {
  const mistralApiKey = process.env.MISTRAL_API_KEY ?? '';
  const sanitized = messageBody.replace(/[<>]/g, '').slice(0, 500);

  if (!mistralApiKey) {
    const fallback = "Thanks for reaching out! Our team will get back to you shortly.";
    await sendOpenWAMessage(openwaConfig, fromPhone, fallback);
    fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, ai_response: fallback, requires_human_intervention: true, status: 'open', merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) }).catch(() => {});
    return 'escalated_no_key';
  }

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const historyRes = await fetch(`${supabaseUrl}/rest/v1/support_tickets?customer_phone=eq.${phone}&created_at=gt.${oneHourAgo}&order=created_at.desc&limit=10`, { headers });
    const historyData = await historyRes.json();
    const pastMessages = [];
    if (Array.isArray(historyData)) {
      const chronological = [...historyData].reverse();
      for (const ticket of chronological) {
        if (ticket.ai_response === 'GREETING_QUESTION' || ticket.ai_response === 'BOT_SELECTED' || ticket.ai_response === 'HUMAN_SELECTED' || ticket.ai_response === 'HUMAN_MODE_IGNORED') {
          continue;
        }
        if (ticket.message) pastMessages.push({ role: 'user', content: ticket.message });
        if (ticket.ai_response && ticket.ai_response !== 'ESCALATE') pastMessages.push({ role: 'assistant', content: ticket.ai_response });
      }
    }
    console.log(`[AI FAQ] Reconstructed history for ${phone} (last 1hr):`, JSON.stringify(pastMessages));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const aiRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mistralApiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL ?? 'mistral-large-latest',
        messages: [
          { role: 'system', content: `You are a strict booking assistant for AquaClean Services. 
YOUR ONLY GOAL when a user wants a cleaning is to collect EXACTLY these 5 details:
1. Full Name
2. Full Address
3. Service Type (tank/sofa/deep/car/carpet)
4. Preferred Date (YYYY-MM-DD)
5. Time Slot (Morning/Afternoon)

CRITICAL RULES:
- NEVER say a service is booked or confirmed until you have ALL 5 details.
- If any detail is missing, you MUST ask the user for it. Do not guess.
- ONCE YOU HAVE ALL 5 DETAILS, you MUST call the book_cleaning_service tool.
- Answer general questions (prices, hours) concisely.
- Do not exceed 80 words per response.

Pricing:
- Water tank (standard): 500L: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800
- Deep cleaning: +30%
- Sofa: Rs.500/seat, full set Rs.1500
- Car seats: Rs.300/seat, full interior Rs.2000
- Carpet: starting Rs.600
Hours: Mon-Sat, 8AM-6PM

Respond in the language the user writes (Hindi, Hinglish, or English). If asked completely unrelated topics, output exactly: ESCALATE` },
          ...pastMessages,
          { role: 'user', content: sanitized },
        ],
        max_tokens: 250, temperature: 0.7,
        tools: [
          {
            type: "function",
            function: {
              name: "book_cleaning_service",
              description: "Book a cleaning service when you have all customer details.",
              parameters: {
                type: "object",
                properties: {
                  customer_name: { type: "string" },
                  address: { type: "string" },
                  service_type: { type: "string", enum: ["standard_cleaning", "deep_cleaning", "sofa_cleaning", "car_cleaning", "carpet_cleaning"] },
                  service_date: { type: "string", description: "YYYY-MM-DD format" },
                  slot: { type: "string", enum: ["morning", "afternoon"] }
                },
                required: ["customer_name", "address", "service_type", "service_date", "slot"]
              }
            }
          }
        ],
        tool_choice: "auto"
      }),
    });
    clearTimeout(timeout);
    const aiData = await aiRes.json();
    const message = aiData?.choices?.[0]?.message;

    if (message?.tool_calls?.length > 0) {
      const toolCall = message.tool_calls[0];
      if (toolCall.function.name === 'book_cleaning_service') {
        const args = JSON.parse(toolCall.function.arguments);
        const merchant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // Default merchant
        
        // UPSERT Customer
        const custRes = await fetch(`${supabaseUrl}/rest/v1/customers?phone=eq.${phone}`, { headers });
        const existingCusts = await custRes.json();
        let customer_id;
        let tank_capacity = 1000;
        
        if (Array.isArray(existingCusts) && existingCusts.length > 0) {
          customer_id = existingCusts[0].id;
          tank_capacity = existingCusts[0].tank_capacity_liters || 1000;
          await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}`, { method: 'PATCH', headers, body: JSON.stringify({ name: args.customer_name, address: args.address }) });
        } else {
          const insertRes = await fetch(`${supabaseUrl}/rest/v1/customers`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ merchant_id, name: args.customer_name, phone, address: args.address }) });
          const newCusts = await insertRes.json();
          if (Array.isArray(newCusts) && newCusts.length > 0) { customer_id = newCusts[0].id; }
        }
        
        if (customer_id) {
          // Determine price based on service type
          let price = 1200;
          if (args.service_type === 'sofa_cleaning') price = 1500;
          else if (args.service_type === 'car_cleaning') price = 2000;
          else if (args.service_type === 'deep_cleaning') price = 1560;
          
          await fetch(`${supabaseUrl}/rest/v1/service_cards`, { method: 'POST', headers, body: JSON.stringify({ customer_id, merchant_id, service_type: args.service_type, service_date: args.service_date, job_status: 'pending', notes: `Auto-booked via AI Assistant (${args.slot} slot)`, service_details: { services: [{ serviceType: args.service_type, items: [{ id: 'item-auto', quantity: 1, price, capacity: tank_capacity }], totalPrice: price }], totalCharge: price, tankCount: 1, tankCapacity: tank_capacity, totalCapacity: tank_capacity, serviceType: args.service_type } }) });
          
          const finalResponse = `Great! Your ${args.service_type.replace('_', ' ')} is confirmed for ${args.service_date} (${args.slot}). Our team will visit ${args.address}. Thank you!`;
          await sendOpenWAMessage(openwaConfig, fromPhone, finalResponse);
          fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, ai_response: finalResponse, requires_human_intervention: false, status: 'auto_resolved', merchant_id }) }).catch(() => {});
          return 'booked';
        }
      }
    }

    const aiResponse = message?.content?.trim() ?? 'ESCALATE';
    const isEscalated = aiResponse === 'ESCALATE';
    const finalResponse = isEscalated ? "Thanks for reaching out! Our team will get back to you shortly." : aiResponse;

    await sendOpenWAMessage(openwaConfig, fromPhone, finalResponse);
    fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, ai_response: finalResponse, requires_human_intervention: isEscalated, status: isEscalated ? 'open' : 'auto_resolved', merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) }).catch(() => {});
    return isEscalated ? 'escalated' : 'resolved';
  } catch (err) {
    console.log('[AI FAQ] Error:', err.message);
    const fallback = "Thanks for reaching out! Our team will get back to you shortly.";
    await sendOpenWAMessage(openwaConfig, fromPhone, fallback);
    fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, requires_human_intervention: true, status: 'open', merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }) }).catch(() => {});
    return 'error';
  }
}

// ── Health Check ──────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const result = { status: 'ok', openwa: 'not_configured', db: 'error', ai: 'not_configured', timestamp: new Date().toISOString() };

  try {
    const config = getOpenWAConfig();
    if (config.apiKey && config.sessionId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}`, {
        headers: { 'X-API-Key': config.apiKey, 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      result.openwa = response.ok ? 'connected' : 'error';
    }
  } catch { result.openwa = 'error'; }

  try {
    const { supabaseUrl, headers } = getSupabaseHeaders();
    if (supabaseUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${supabaseUrl}/rest/v1/merchants?select=id&limit=1`, { headers, signal: controller.signal });
      clearTimeout(timeout);
      result.db = response.ok ? 'ok' : 'error';
    }
  } catch { result.db = 'error'; }

  result.ai = process.env.MISTRAL_API_KEY ? 'ok' : 'not_configured';
  if (result.db === 'error') result.status = 'error';
  else if (result.openwa === 'error') result.status = 'degraded';

  res.status(result.status === 'error' ? 503 : 200).json(result);
});

// ── Webhook ───────────────────────────────────────────────
app.get('/api/webhook', (_req, res) => {
  res.set(corsHeaders);
  res.send('AquaTrak webhook is running');
});

app.post('/api/webhook', async (req, res) => {
  console.log('[WEBHOOK] POST - Incoming message');
  try {
    const { supabaseUrl, headers } = getSupabaseHeaders();
    const event = req.body.event;
    const data = req.body.data ?? {};
    const idempotencyKey = req.body.idempotencyKey;
    const fromJid = data.from ?? '';
    const messageBody = data.body ?? '';
    const location = data.location ?? null;
    const latitude = location?.latitude;
    const longitude = location?.longitude;

    if (event !== 'message.received' || !data || data.fromMe) {
      return res.set(corsHeaders).json({ status: 'ignored' });
    }

    const openwaConfig = getOpenWAConfig();
    let phone = extractPhone(fromJid);
    let fromPhone = fromJid.split('@')[0];
    const isLid = fromJid.includes('@lid');

    if (isLid) {
      const resolved = await resolveLidToPhone(openwaConfig, fromJid);
      console.log(`[WEBHOOK] LID ${fromJid} → ${resolved || 'FAILED'}`);
      if (resolved) {
        phone = resolved;
        fromPhone = `91${resolved}`;
      } else {
        // LID→phone failed. Reply directly to the LID JID.
        // Baileys + WhatsApp route @lid messages server-side.
        fromPhone = fromJid; // e.g. '245303030599767@lid'
        console.log(`[WEBHOOK] Using raw LID JID for reply: ${fromPhone}`);
      }
    }

    // Idempotency check
    if (idempotencyKey) {
      try {
        const existing = await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency?key=eq.${encodeURIComponent(idempotencyKey)}&select=key`, { headers });
        const rows = await existing.json();
        if (Array.isArray(rows) && rows.length > 0) {
          console.log('[WEBHOOK] Duplicate message skipped');
          return res.set(corsHeaders).json({ status: 'duplicate' });
        }
      } catch {}
    }

    // Look up staff
    let staffMember = null;
    if (phone) {
      const staffRes = await fetch(`${supabaseUrl}/rest/v1/staff?phone=eq.${phone}&is_active=eq.true&select=*`, { headers });
      const staff = await staffRes.json();
      staffMember = Array.isArray(staff) && staff.length > 0 ? staff[0] : null;
    }

    // Non-staff
    if (!staffMember) {
      // ── Bot/Human State Routing Machine ──
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      let lastState = null;
      try {
        const historyRes = await fetch(`${supabaseUrl}/rest/v1/support_tickets?customer_phone=eq.${phone}&created_at=gt.${oneHourAgo}&order=created_at.desc&limit=10`, { headers });
        const historyData = await historyRes.json();
        if (Array.isArray(historyData) && historyData.length > 0) {
          for (const ticket of historyData) {
            if (ticket.ai_response === 'GREETING_QUESTION' || ticket.ai_response === 'BOT_SELECTED' || ticket.ai_response === 'HUMAN_SELECTED' || ticket.ai_response === 'HUMAN_MODE_IGNORED') {
              lastState = ticket.ai_response;
              break;
            }
          }
        }
      } catch (e) {
        console.error('[WEBHOOK ROUTING ERROR]', e.message);
      }

      const normalizedMsg = messageBody.trim().toLowerCase();

      if (!lastState) {
        // First message in 1 hour -> Send Greeting Question
        const greeting = "नमस्ते! AquaClean Services में आपका स्वागत है।\nबताइए, आप हमारे AI Bot से बात करना चाहते हैं या Human Support (इंसान) से?\n\nKripya reply karein:\n1️⃣ AI Bot (फटाफट बुकिंग और जवाब के लिए)\n2️⃣ Human (इंसान से बात करने के लिए)";
        await sendWithRetry(openwaConfig, fromPhone, greeting);
        await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { 
          method: 'POST', 
          headers, 
          body: JSON.stringify({ 
            customer_phone: phone, 
            message: messageBody, 
            ai_response: 'GREETING_QUESTION', 
            requires_human_intervention: false, 
            status: 'auto_resolved', 
            merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
          }) 
        }).catch(() => {});
        
        if (idempotencyKey) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
          } catch {}
        }
        return res.set(corsHeaders).json({ status: 'routing_question_sent' });
      }

      if (lastState === 'GREETING_QUESTION') {
        if (normalizedMsg === '1' || normalizedMsg.includes('bot') || normalizedMsg.includes('ai') || normalizedMsg.includes('one')) {
          const confirmBot = "AI Bot selected! 🤖\n\nHow can I help you today? Ask me about tank cleaning prices, sofa/car cleaning, or tell me if you'd like to book a service.";
          await sendWithRetry(openwaConfig, fromPhone, confirmBot);
          await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify({ 
              customer_phone: phone, 
              message: messageBody, 
              ai_response: 'BOT_SELECTED', 
              requires_human_intervention: false, 
              status: 'auto_resolved', 
              merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
            }) 
          }).catch(() => {});
          
          if (idempotencyKey) {
            try {
              await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
            } catch {}
          }
          return res.set(corsHeaders).json({ status: 'bot_mode_enabled' });
        } else if (normalizedMsg === '2' || normalizedMsg.includes('human') || normalizedMsg.includes('person') || normalizedMsg.includes('two')) {
          const confirmHuman = "Human Support selected! 👤\n\nOur team has been notified and will contact you shortly.";
          await sendWithRetry(openwaConfig, fromPhone, confirmHuman);
          await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify({ 
              customer_phone: phone, 
              message: messageBody, 
              ai_response: 'HUMAN_SELECTED', 
              requires_human_intervention: true, 
              status: 'open', 
              merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
            }) 
          }).catch(() => {});
          
          if (idempotencyKey) {
            try {
              await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
            } catch {}
          }
          return res.set(corsHeaders).json({ status: 'human_mode_enabled' });
        } else {
          const repeatMsg = "Invalid choice. Please reply with:\n1️⃣ for AI Bot\n2️⃣ for Human Support";
          await sendWithRetry(openwaConfig, fromPhone, repeatMsg);
          await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { 
            method: 'POST', 
            headers, 
            body: JSON.stringify({ 
              customer_phone: phone, 
              message: messageBody, 
              ai_response: 'GREETING_QUESTION', 
              requires_human_intervention: false, 
              status: 'auto_resolved', 
              merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
            }) 
          }).catch(() => {});
          
          if (idempotencyKey) {
            try {
              await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
            } catch {}
          }
          return res.set(corsHeaders).json({ status: 'routing_question_repeated' });
        }
      }

      if (lastState === 'HUMAN_SELECTED' || lastState === 'HUMAN_MODE_IGNORED') {
        await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { 
          method: 'POST', 
          headers, 
          body: JSON.stringify({ 
            customer_phone: phone, 
            message: messageBody, 
            ai_response: 'HUMAN_MODE_IGNORED', 
            requires_human_intervention: true, 
            status: 'open', 
            merchant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
          }) 
        }).catch(() => {});
        
        if (idempotencyKey) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
          } catch {}
        }
        return res.set(corsHeaders).json({ status: 'ignored_human_mode' });
      }
      // Check if customer
      let customer = null;
      if (phone) {
        const customerRes = await fetch(`${supabaseUrl}/rest/v1/customers?phone=eq.${phone}&select=*`, { headers });
        const customerData = await customerRes.json();
        customer = Array.isArray(customerData) && customerData.length > 0 ? customerData[0] : null;
      }

      if (customer) {
        const text = messageBody.toLowerCase().trim();
        if (text === 'yes' || text === 'confirm' || text === 'haan') {
          const remsRes = await fetch(`${supabaseUrl}/rest/v1/reminder_responses?customer_id=eq.${customer.id}&status=eq.sent&order=created_at.desc&limit=1`, { headers });
          const rems = await remsRes.json();
          if (Array.isArray(rems) && rems.length > 0) {
            await fetch(`${supabaseUrl}/rest/v1/reminder_responses?id=eq.${rems[0].id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'responded', responded_at: new Date().toISOString(), response: messageBody }) });
          }
          await sendWithRetry(openwaConfig, fromPhone, "Namaste! Cleaning book karne ke liye dhanyavad. Kripya timing select karein: 'Morning' (8AM-1PM) ya 'Afternoon' (1PM-6PM)?");
        } else if (text.includes('morning') || text.includes('afternoon')) {
          const remsRes = await fetch(`${supabaseUrl}/rest/v1/reminder_responses?customer_id=eq.${customer.id}&status=eq.responded&order=created_at.desc&limit=1`, { headers });
          const rems = await remsRes.json();
          if (Array.isArray(rems) && rems.length > 0) {
            const slot = text.includes('morning') ? 'morning' : 'afternoon';
            const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            await fetch(`${supabaseUrl}/rest/v1/service_cards`, { method: 'POST', headers, body: JSON.stringify({ customer_id: customer.id, merchant_id: customer.merchant_id, service_type: 'standard_cleaning', service_date: tomorrow, job_status: 'pending', notes: `Auto-booked via WhatsApp reply (${slot} slot)`, service_details: { services: [{ serviceType: 'standard_cleaning', items: [{ id: 'item-auto', quantity: 1, price: 1200, capacity: customer.tank_capacity_liters || 1000 }], totalPrice: 1200 }], totalCharge: 1200, tankCount: 1, tankCapacity: customer.tank_capacity_liters || 1000, totalCapacity: customer.tank_capacity_liters || 1000, serviceType: 'standard_cleaning' } }) });
            await fetch(`${supabaseUrl}/rest/v1/reminder_responses?id=eq.${rems[0].id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'booked' }) });
            await sendWithRetry(openwaConfig, fromPhone, `Dhanyavad! Aapki service kal (${tomorrow}) ${slot} slot ke liye book ho chuki hai.`);
          } else {
            await handleFAQ(supabaseUrl, headers, openwaConfig, fromPhone, phone, messageBody);
          }
        } else {
          await handleFAQ(supabaseUrl, headers, openwaConfig, fromPhone, phone, messageBody);
        }
      } else {
        if (latitude && longitude) {
          await sendWithRetry(openwaConfig, fromPhone, 'You are not registered as staff. Contact your manager.');
        } else {
          await handleFAQ(supabaseUrl, headers, openwaConfig, fromPhone, phone, messageBody);
        }
      }

      // Record idempotency
      if (idempotencyKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
        } catch {}
      }
      return res.set(corsHeaders).json({ status: 'processed' });
    }

    // Staff + location → check-in
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const today = new Date().toISOString().slice(0, 10);
      const jobRes = await fetch(`${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`, { headers });
      const jobs = await jobRes.json();
      if (!Array.isArray(jobs) || jobs.length === 0) {
        await sendWithRetry(openwaConfig, fromPhone, 'No job assigned for today. Contact your manager.');
        return res.set(corsHeaders).json({ status: 'no_job' });
      }
      const job = jobs[0];
      if (job.customers?.latitude && job.customers?.longitude) {
        const distance = getDistance(lat, lng, job.customers.latitude, job.customers.longitude);
        const verified = distance <= 100;
        await fetch(`${supabaseUrl}/rest/v1/attendance`, { method: 'POST', headers, body: JSON.stringify({ staff_id: staffMember.id, merchant_id: staffMember.merchant_id, checkin_time: new Date().toISOString(), verified_location: verified, date: today, notes: verified ? 'Auto check-in via WhatsApp' : `Location ${distance}m from site` }) });
        await sendWithRetry(openwaConfig, fromPhone, verified ? `Check-in confirmed at ${job.customers?.address ?? 'job site'}! Have a great shift.` : `You're ${distance}m away from the job site. Please share your location once you arrive.`);
      } else {
        await fetch(`${supabaseUrl}/rest/v1/attendance`, { method: 'POST', headers, body: JSON.stringify({ staff_id: staffMember.id, merchant_id: staffMember.merchant_id, checkin_time: new Date().toISOString(), verified_location: false, date: today, notes: 'Check-in — no site coordinates available' }) });
        await sendWithRetry(openwaConfig, fromPhone, 'Check-in recorded. No site coordinates available for verification.');
      }
    } else {
      const text = messageBody.toLowerCase().trim();
      if (text === 'checkout') {
        const today = new Date().toISOString().slice(0, 10);
        const attRes = await fetch(`${supabaseUrl}/rest/v1/attendance?staff_id=eq.${staffMember.id}&date=eq.${today}&checkout_time=is.null&select=id`, { headers });
        const att = await attRes.json();
        if (Array.isArray(att) && att.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/attendance?id=eq.${att[0].id}`, { method: 'PATCH', headers, body: JSON.stringify({ checkout_time: new Date().toISOString() }) });
          await sendWithRetry(openwaConfig, fromPhone, 'Checked out. Good work today!');
        } else {
          await sendWithRetry(openwaConfig, fromPhone, 'No active check-in found for today.');
        }
      } else if (text === 'done' || text === 'completed' || text === 'complete') {
        const today = new Date().toISOString().slice(0, 10);
        const activeJobRes = await fetch(`${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&job_status=neq.completed&select=*,customers(*)`, { headers });
        const activeJobs = await activeJobRes.json();
        if (Array.isArray(activeJobs) && activeJobs.length > 0) {
          const job = activeJobs[0];
          await fetch(`${supabaseUrl}/rest/v1/service_cards?id=eq.${job.id}`, { method: 'PATCH', headers, body: JSON.stringify({ job_status: 'completed' }) });
          await sendWithRetry(openwaConfig, fromPhone, 'Job completed! Inventory levels updated automatically.');
          const customerPhone = job.customers?.phone;
          const customerName = job.customers?.name;
          const amount = Math.max(0, (job.service_details?.totalCharge || 1200) - (job.discount || 0));
          if (customerPhone) {
            const upiUrl = `upi://pay?pa=9876543210@okbizaxis&pn=AquaClean&am=${amount}&cu=INR`;
            await sendWithRetry(openwaConfig, `91${customerPhone}@c.us`, `Namaste ${customerName}! AquaClean Services se tank cleaning poori ho chuki hai. Kripya ₹${amount} ka payment is link ke zariye karein: ${upiUrl}`);
          }
        } else {
          await sendWithRetry(openwaConfig, fromPhone, 'No active job found for today to mark as DONE.');
        }
      } else {
        await handleFAQ(supabaseUrl, headers, openwaConfig, fromPhone, phone, messageBody);
      }
    }

    // Record idempotency
    if (idempotencyKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/webhook_idempotency`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: idempotencyKey }) });
      } catch {}
    }
    res.set(corsHeaders).json({ status: 'processed' });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    res.set(corsHeaders).status(500).json({ error: err.message });
  }
});

// ── Cron: Send Reminders ──────────────────────────────────
app.all('/api/cron/send-reminders', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const authHeader = req.headers.authorization ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { supabaseUrl, headers } = getSupabaseHeaders();
    const openwaConfig = getOpenWAConfig();
    const today = new Date().toISOString().slice(0, 10);

    const cardsRes = await fetch(`${supabaseUrl}/rest/v1/service_cards?select=id,customer_id,next_service_date,reminder_sent_at,customers(name,phone)&next_service_date=lte.${today}&reminder_sent_at=is.null&job_status=eq.pending`, { headers });
    const cards = await cardsRes.json();
    if (!Array.isArray(cards)) throw new Error('Failed to fetch service cards');

    let sent = 0, failed = 0;
    for (const card of cards) {
      try {
        const customer = card.customers;
        if (!customer?.phone) { failed++; continue; }
        const reminderMessage = `Namaste ${customer.name}! Aapke paani ki tanki ki safai ka samay aa gaya hai. Gande tank se bimariyan failti hain. Aaj hi safai book karein! Reply YES to confirm or call 9876543210. — AquaClean Services`;
        const result = await sendWithRetry(openwaConfig, customer.phone, reminderMessage);
        if (result.ok) {
          await fetch(`${supabaseUrl}/rest/v1/service_cards?id=eq.${card.id}`, { method: 'PATCH', headers, body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }) });
          sent++;
        } else {
          await fetch(`${supabaseUrl}/rest/v1/cron_logs`, { method: 'POST', headers, body: JSON.stringify({ type: 'send_reminder', status: 'failed', error_message: `OpenWA error for card ${card.id}: ${result.error}` }) });
          failed++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { failed++; }
    }

    if (sent > 0 || failed > 0) {
      await fetch(`${supabaseUrl}/rest/v1/cron_logs`, { method: 'POST', headers, body: JSON.stringify({ type: 'send_reminder', status: failed > 0 ? 'partial' : 'success', error_message: failed > 0 ? `${failed} reminders failed` : null }) });
    }
    res.json({ sent, failed, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cron: Daily Briefing ──────────────────────────────────
app.all('/api/cron/daily-briefing', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const authHeader = req.headers.authorization ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });

    const { supabaseUrl, headers } = getSupabaseHeaders();
    const openwaConfig = getOpenWAConfig();
    const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const today = new Date().toISOString().slice(0, 10);

    const [jobsRes, staffRes, attendanceRes, inventoryRes, stockAlertsRes, remindersRes, ticketsRes, merchantRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/service_cards?select=*,customers(*),staff(*)&service_date=eq.${today}&merchant_id=eq.${MERCHANT_ID}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/staff?select=*&merchant_id=eq.${MERCHANT_ID}&is_active=eq.true`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/attendance?select=*,staff(*)&date=eq.${today}&merchant_id=eq.${MERCHANT_ID}&checkin_time=not.is.null`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/inventory?select=*&merchant_id=eq.${MERCHANT_ID}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/stock_alerts?select=*,inventory(*)&merchant_id=eq.${MERCHANT_ID}&resolved=eq.false`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/service_cards?select=*,customers(*)&merchant_id=eq.${MERCHANT_ID}&next_service_date=lte.${today}&reminder_sent_at=is.null`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/support_tickets?select=id&status=eq.open`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`, { headers }),
    ]);

    const jobs = await jobsRes.json();
    const staff = await staffRes.json();
    const attendance = await attendanceRes.json();
    const inventory = await inventoryRes.json();
    const stockAlerts = await stockAlertsRes.json();
    const reminders = await remindersRes.json();
    const ticketsData = await ticketsRes.json();
    const merchantData = await merchantRes.json();
    const openTickets = Array.isArray(ticketsData) ? ticketsData.length : 0;
    const merchantPhone = Array.isArray(merchantData) && merchantData.length > 0 ? merchantData[0].phone : null;

    const pending = Array.isArray(jobs) ? jobs.filter(j => j.job_status === 'pending').length : 0;
    const inProgress = Array.isArray(jobs) ? jobs.filter(j => j.job_status === 'in_progress').length : 0;
    const completed = Array.isArray(jobs) ? jobs.filter(j => j.job_status === 'completed').length : 0;
    const checkedInIds = new Set(Array.isArray(attendance) ? attendance.map(a => a.staff_id) : []);
    const checkedInCount = Array.isArray(staff) ? staff.filter(s => checkedInIds.has(s.id)).length : 0;

    const briefingText = `📋 *Daily Operations Briefing*\n📅 ${today}\n\n📌 *Today's Jobs: ${Array.isArray(jobs) ? jobs.length : 0}*\n   Pending: ${pending} · In Progress: ${inProgress} · Completed: ${completed}\n\n👥 *Workers: ${checkedInCount}/${Array.isArray(staff) ? staff.length : 0} active*\n\n🎫 *Open Support Tickets: ${openTickets}*\n\n✅ Open AquaTrak for full details.`;

    let whatsappSent = false;
    if (openwaConfig.apiKey && merchantPhone) {
      const result = await sendWithRetry(openwaConfig, merchantPhone, briefingText);
      whatsappSent = result.ok;
    }

    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, { method: 'POST', headers, body: JSON.stringify({ type: 'daily_briefing', status: 'success', error_message: whatsappSent ? null : 'OpenWA not configured or merchant phone unavailable' }) });

    res.json({ briefing: briefingText, whatsappSent, date: today, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cron: Stock Alerts ────────────────────────────────────
app.all('/api/cron/stock-alerts', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const authHeader = req.headers.authorization ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });

    const { supabaseUrl, headers } = getSupabaseHeaders();
    const openwaConfig = getOpenWAConfig();
    const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    const invRes = await fetch(`${supabaseUrl}/rest/v1/inventory?select=*&merchant_id=eq.${MERCHANT_ID}&current_stock=lt.minimum_threshold`, { headers });
    const lowItems = await invRes.json();
    if (!Array.isArray(lowItems) || lowItems.length === 0) {
      return res.json({ alerts: 0, timestamp: new Date().toISOString() });
    }

    const alertRes = await fetch(`${supabaseUrl}/rest/v1/stock_alerts?select=inventory_id&merchant_id=eq.${MERCHANT_ID}&resolved=eq.false`, { headers });
    const existingAlerts = await alertRes.json();
    const alertedIds = new Set(Array.isArray(existingAlerts) ? existingAlerts.map(a => a.inventory_id) : []);

    let created = 0;
    for (const item of lowItems) {
      if (alertedIds.has(item.id)) continue;
      await fetch(`${supabaseUrl}/rest/v1/stock_alerts`, { method: 'POST', headers, body: JSON.stringify({ inventory_id: item.id, merchant_id: MERCHANT_ID, alert_type: 'low_stock', resolved: false }) });
      created++;
    }

    if (created > 0 || lowItems.length > 0) {
      const merchantRes = await fetch(`${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`, { headers });
      const merchantData = await merchantRes.json();
      const merchantPhone = Array.isArray(merchantData) && merchantData.length > 0 ? merchantData[0].phone : null;
      if (merchantPhone && openwaConfig.apiKey) {
        const lines = lowItems.map(item => `• ${item.item_name}: ${item.current_stock}${item.unit} (min: ${item.minimum_threshold}${item.unit})`);
        await sendWithRetry(openwaConfig, merchantPhone, `⚠️ *Low Stock Alert*\n\n${lines.join('\n')}\n\nPlease reorder supplies.`);
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, { method: 'POST', headers, body: JSON.stringify({ type: 'stock_alerts', status: 'success', error_message: created > 0 ? `${created} new alerts created` : null }) });
    res.json({ lowItems: lowItems.length, newAlerts: created, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cron: Weekly Revenue Insight ──────────────────────────
app.all('/api/cron/weekly-revenue-insight', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET ?? '';
    const authHeader = req.headers.authorization ?? '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });

    const { supabaseUrl, headers } = getSupabaseHeaders();
    const openwaConfig = getOpenWAConfig();
    const MERCHANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

    const cardsRes = await fetch(`${supabaseUrl}/rest/v1/service_cards?select=*,customers(name,phone)&merchant_id=eq.${MERCHANT_ID}&next_service_date=gte.${monthStart}&next_service_date=lte.${monthEnd}`, { headers });
    const cards = await cardsRes.json();
    const remsRes = await fetch(`${supabaseUrl}/rest/v1/reminder_responses?select=customer_id&merchant_id=eq.${MERCHANT_ID}&status=eq.sent`, { headers });
    const reminders = await remsRes.json();
    const nonResponderIds = new Set(Array.isArray(reminders) ? reminders.map(r => r.customer_id) : []);

    let totalRevenue = 0;
    const dueCustomers = [], nonResponders = [];
    if (Array.isArray(cards)) {
      for (const card of cards) {
        totalRevenue += card.service_details?.totalCharge || 1200;
        dueCustomers.push(card.customers?.name ?? 'Unknown');
        if (nonResponderIds.has(card.customer_id)) nonResponders.push(card.customers?.name ?? 'Unknown');
      }
    }

    const lines = [
      '📊 *Weekly Revenue Insight*',
      `📅 ${today.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}`,
      '',
      `👥 *${dueCustomers.length} customers due this month*`,
      `💰 *Potential revenue: ₹${totalRevenue.toLocaleString('en-IN')}*`,
      '',
    ];
    if (nonResponders.length > 0) {
      lines.push(`⚠️ *${nonResponders.length} customer(s) haven't responded to reminders:*`);
      for (const name of nonResponders.slice(0, 5)) lines.push(`   • ${name}`);
      lines.push('', '👉 Consider sending follow-up reminders to these customers.');
    } else {
      lines.push('✅ All customers have responded to reminders.');
    }

    const merchantRes = await fetch(`${supabaseUrl}/rest/v1/merchants?select=phone&id=eq.${MERCHANT_ID}`, { headers });
    const merchantData = await merchantRes.json();
    const merchantPhone = Array.isArray(merchantData) && merchantData.length > 0 ? merchantData[0].phone : null;

    let whatsappSent = false;
    if (merchantPhone && openwaConfig.apiKey) {
      const result = await sendWithRetry(openwaConfig, merchantPhone, lines.join('\n'));
      whatsappSent = result.ok;
    }

    await fetch(`${supabaseUrl}/rest/v1/cron_logs`, { method: 'POST', headers, body: JSON.stringify({ type: 'weekly_revenue', status: 'success', error_message: whatsappSent ? null : 'OpenWA not configured or merchant phone unavailable' }) });
    res.json({ dueCustomers: dueCustomers.length, totalRevenue, nonResponders: nonResponders.length, whatsappSent, date: today.toISOString().slice(0, 10), timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Root ──────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'AquaTrak Bot', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 AquaTrak bot server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Webhook: http://localhost:${PORT}/api/webhook`);
});
