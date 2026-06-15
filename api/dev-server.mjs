import express from 'express';
import { URLSearchParams } from 'url';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
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

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getOpenWAConfig() {
  return {
    baseUrl: process.env.OPENWA_API_URL ?? "http://localhost:2785",
    apiKey: process.env.OPENWA_API_KEY ?? "",
    sessionId: process.env.OPENWA_SESSION_ID ?? "",
  };
}

function toJID(phone) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) return `91${cleaned.slice(1)}@c.us`;
  if (cleaned.startsWith("+")) return `${cleaned.slice(1)}@c.us`;
  if (cleaned.startsWith("91") && cleaned.length === 12) return `${cleaned}@c.us`;
  return `${cleaned}@c.us`;
}

async function sendOpenWAMessage(config, to, body) {
  if (!config.apiKey || !config.sessionId) {
    console.log('[OPENWA] No credentials, skipping');
    return { ok: false, error: 'No credentials' };
  }
  const chatId = toJID(to);
  const res = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, text: body }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.log('[OPENWA ERROR]', errorText);
    return { ok: false, error: errorText };
  }
  const data = await res.json();
  console.log('[OPENWA] Sent to', chatId);
  return { ok: true, messageId: data.messageId };
}

function extractPhone(from) {
  let phone = from.split("@")[0];
  if (phone.startsWith("91") && phone.length === 12) return phone.slice(2);
  return phone;
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// GET webhook verification
app.get('/api/webhook', (req, res) => {
  console.log('[WEBHOOK] GET - Verification request');
  res.set(corsHeaders);
  res.send('AquaTrak webhook is running');
});

// POST webhook - incoming messages (OpenWA JSON format)
app.post('/api/webhook', async (req, res) => {
  console.log('[WEBHOOK] POST - Incoming message');
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };

    // OpenWA JSON payload: { event, sessionId, data: { from, body, location } }
    const event = req.body.event;
    const data = req.body.data ?? {};
    
    const fromJid = data.from ?? '';
    const messageBody = data.body ?? '';
    const location = data.location ?? null;
    const latitude = location?.latitude;
    const longitude = location?.longitude;

    console.log('[WEBHOOK] Event:', event, 'From:', fromJid, 'Body:', messageBody, 'Lat:', latitude, 'Lng:', longitude);

    // Convert JID to phone number
    const fromPhone = fromJid.split('@')[0];
    if (!fromPhone || !event?.includes('message')) {
      res.set(corsHeaders);
      return res.json({ status: 'ignored_event' });
    }

    const phone = extractPhone(fromJid);
    const openwaConfig = getOpenWAConfig();

    // Look up staff
    const staffRes = await fetch(`${supabaseUrl}/rest/v1/staff?phone=eq.${phone}&is_active=eq.true&select=*`, { headers });
    const staff = await staffRes.json();
    console.log('[WEBHOOK] Staff lookup:', staff.length > 0 ? staff[0].name : 'NOT FOUND');

    if (!Array.isArray(staff) || staff.length === 0) {
      await sendOpenWAMessage(openwaConfig, fromPhone, 'You are not registered as staff. Contact your manager.');
      res.set(corsHeaders);
      return res.json({ status: 'not_staff' });
    }

    const staffMember = staff[0];

    // Handle location (check-in)
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const today = new Date().toISOString().slice(0, 10);
      const jobRes = await fetch(`${supabaseUrl}/rest/v1/service_cards?technician_id=eq.${staffMember.id}&service_date=eq.${today}&select=*,customers(latitude,longitude,address)`, { headers });
      const jobs = await jobRes.json();

      if (!Array.isArray(jobs) || jobs.length === 0) {
        await sendOpenWAMessage(openwaConfig, fromPhone, 'No job assigned for today. Contact your manager.');
        res.set(corsHeaders);
        return res.json({ status: 'no_job' });
      }

      const job = jobs[0];
      const siteLat = job.customers?.latitude;
      const siteLng = job.customers?.longitude;

      if (siteLat && siteLng) {
        const distance = getDistance(lat, lng, siteLat, siteLng);
        const verified = distance <= 100;
        await fetch(`${supabaseUrl}/rest/v1/attendance`, {
          method: 'POST', headers,
          body: JSON.stringify({ staff_id: staffMember.id, merchant_id: staffMember.merchant_id, checkin_time: new Date().toISOString(), verified_location: verified, date: today, notes: verified ? 'Auto check-in via WhatsApp' : `Location ${distance}m from site` }),
        });
        const msg = verified
          ? `Check-in confirmed at ${job.customers?.address ?? 'job site'}! Have a great shift.`
          : `You're ${distance}m away from the job site. Please share your location once you arrive.`;
        await sendOpenWAMessage(openwaConfig, fromPhone, msg);
      } else {
        await fetch(`${supabaseUrl}/rest/v1/attendance`, {
          method: 'POST', headers,
          body: JSON.stringify({ staff_id: staffMember.id, merchant_id: staffMember.merchant_id, checkin_time: new Date().toISOString(), verified_location: false, date: today, notes: 'Check-in — no site coordinates available' }),
        });
        await sendOpenWAMessage(openwaConfig, fromPhone, 'Check-in recorded. No site coordinates available for verification.');
      }
      res.set(corsHeaders);
      return res.json({ status: 'processed' });
    }

    // Handle text messages
    const text = messageBody.toLowerCase().trim();
    if (text === 'checkout') {
      const today = new Date().toISOString().slice(0, 10);
      const attRes = await fetch(`${supabaseUrl}/rest/v1/attendance?staff_id=eq.${staffMember.id}&date=eq.${today}&checkout_time=is.null&select=id`, { headers });
      const att = await attRes.json();
      if (Array.isArray(att) && att.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/attendance?id=eq.${att[0].id}`, { method: 'PATCH', headers, body: JSON.stringify({ checkout_time: new Date().toISOString() }) });
        await sendOpenWAMessage(openwaConfig, fromPhone, 'Checked out. Good work today!');
      } else {
        await sendOpenWAMessage(openwaConfig, fromPhone, 'No active check-in found for today.');
      }
    } else {
      // AI FAQ
      const aiApiKey = process.env.NORTH_MINI_API_KEY ?? '';
      if (!aiApiKey) {
        await sendOpenWAMessage(openwaConfig, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
        await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: messageBody, requires_human_intervention: true, status: 'open' }) });
      } else {
        const sanitized = messageBody.replace(/[^a-zA-Z0-9\s?!,.]/g, '').slice(0, 500);
        try {
          const aiRes = await fetch('https://api.northmini.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'north-mini',
              messages: [
                { role: 'system', content: "You are a customer support assistant for AquaClean Services. We offer water tank cleaning, sofa cleaning, and car seats cleaning. You can ONLY answer questions about: 1) Tank cleaning pricing (500L tank: Rs.800, 1000L: Rs.1200, 2000L+: Rs.1800), 2) Sofa cleaning pricing (per seat: Rs.500, full sofa set: Rs.1500), 3) Car seats cleaning pricing (per seat: Rs.300, full car interior: Rs.2000), 4) Working hours (Mon-Sat, 8AM-6PM), 5) Tank capacity calculation (approximate: length x width x height in meters x 1000 = liters). For ANY other question, respond with exactly: ESCALATE. Keep answers under 50 words. Be friendly and professional." },
                { role: 'user', content: sanitized },
              ],
              max_tokens: 150, temperature: 0.7,
            }),
          });
          const aiData = await aiRes.json();
          const aiResponse = aiData?.choices?.[0]?.message?.content?.trim() ?? 'ESCALATE';
          console.log('[AI FAQ] Response:', aiResponse);

          if (aiResponse.startsWith('ESCALATE')) {
            await sendOpenWAMessage(openwaConfig, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
            await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, ai_response: null, requires_human_intervention: true, status: 'open' }) });
          } else {
            await sendOpenWAMessage(openwaConfig, fromPhone, aiResponse);
            await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, ai_response: aiResponse, requires_human_intervention: false, status: 'auto_resolved' }) });
          }
        } catch (err) {
          console.log('[AI FAQ] Error:', err.message);
          await sendOpenWAMessage(openwaConfig, fromPhone, "I've connected you with our team — they'll respond within 2 hours!");
          await fetch(`${supabaseUrl}/rest/v1/support_tickets`, { method: 'POST', headers, body: JSON.stringify({ customer_phone: phone, message: sanitized, requires_human_intervention: true, status: 'open' }) });
        }
      }
    }

    res.set(corsHeaders);
    res.json({ status: 'processed' });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    res.set(corsHeaders);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 AquaTrak webhook server running on http://localhost:${PORT}`);
  console.log(`\n📋 Webhook URL: http://localhost:${PORT}/api/webhook`);
  console.log(`\nConfigure OpenWA webhook to point to: http://localhost:${PORT}/webhook`);
  console.log(`  URL: http://localhost:${PORT}/api/webhook`);
  console.log(`  Method: POST\n`);
});
