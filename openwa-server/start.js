import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import { readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// Load env variables from the main project's .env file on VM
try {
    const envFile = readFileSync('/home/nikunjkumar05/FutureFounders/.env', 'utf-8');
    for (const line of envFile.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) process.env[key] = value;
    }
} catch (e) {
    console.log('[SERVER] .env load skipped/failed:', e.message);
}

const app = express();
app.use(express.json());

const PORT = 2785;
const API_KEY = process.env.OPENWA_API_KEY || 'owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4';
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'session';
const AUTH_DIR = join(process.cwd(), '.baileys_auth', SESSION_ID);

let latestQR = null;
let clientReady = false;
let sock = null;
let lidToPhoneMap = {};

const logger = pino({ level: 'silent' });

const apiKeyCheck = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (API_KEY && apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};

// Routes
app.get('/health', (_req, res) => {
    res.json({
        status: clientReady ? 'ok' : 'initializing',
        whatsapp: clientReady ? 'connected' : 'disconnected',
        hasQR: !!latestQR
    });
});

app.get('/api/health', (_req, res) => {
    res.json({ status: clientReady ? 'ok' : 'initializing' });
});

app.get('/qr', (_req, res) => {
    if (latestQR) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(latestQR);
    } else {
        res.status(404).send('QR code not ready or client is already connected.');
    }
});

app.get('/api/sessions/:sessionId/qr', apiKeyCheck, (_req, res) => {
    if (latestQR) {
        const qrBase64 = latestQR.toString('base64');
        res.json({ qrCode: `data:image/png;base64,${qrBase64}` });
    } else {
        res.status(404).json({ error: 'QR code not ready or client is already connected.' });
    }
});

app.get('/api/sessions/:sessionId', apiKeyCheck, (_req, res) => {
    if (clientReady) {
        res.json({ status: 'CONNECTED' });
    } else {
        res.status(503).json({ status: 'INITIALIZING', error: 'WhatsApp client is not ready' });
    }
});

app.get('/api/sessions/:sessionId/contacts/:jid', apiKeyCheck, async (req, res) => {
    const { jid } = req.params;
    if (!sock || !clientReady) {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }
    try {
        const lidJid = jid.endsWith('@lid') ? jid : `${jid}@lid`;
        const contact = await sock.onWhatsApp(lidJid);
        if (contact && contact.exists) {
            res.json({ id: contact.jid, name: '', number: jid.split('@')[0] });
        } else {
            const phoneJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
            const contact2 = await sock.onWhatsApp(phoneJid);
            if (contact2 && contact2.exists) {
                res.json({ id: contact2.jid, name: '', number: jid.split('@')[0] });
            } else {
                res.status(404).json({ error: 'Contact not found' });
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/:sessionId/messages/send-text', apiKeyCheck, async (req, res) => {
    const { chatId, text } = req.body;
    if (!chatId || !text) {
        return res.status(400).json({ error: 'Missing chatId or text' });
    }
    if (!sock || !clientReady) {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    console.log(`[CLIENT] Sending message to ${chatId}`);

    sock.sendMessage(chatId, { text })
        .then(msg => {
            console.log(`[CLIENT] Successfully sent message to ${chatId} (ID: ${msg?.key?.id})`);
        })
        .catch(err => {
            console.error(`[CLIENT] Send error to ${chatId}:`, err.message);
        });

    res.json({ messageId: 'msg_' + Date.now() });
});

// Webhook forwarding helper
const forwardToWebhook = async (payload) => {
    try {
        const response = await fetch('http://localhost:3000/api/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[CLIENT] Webhook error response: ${response.status} ${text}`);
        } else {
            console.log(`[CLIENT] Message successfully forwarded to webhook`);
        }
    } catch (err) {
        console.error(`[CLIENT] Failed to forward message to webhook:`, err.message);
    }
};

// LID-to-phone resolution
async function resolveLidToPhone(lidJid) {
    const phone = lidToPhoneMap[lidJid];
    if (phone) return phone;
    if (!sock) return null;
    try {
        const contact = await sock.onWhatsApp(lidJid);
        if (contact && contact.exists && contact.jid && contact.jid.includes('@s.whatsapp.net')) {
            const resolved = contact.jid.split('@')[0];
            lidToPhoneMap[lidJid] = resolved;
            return resolved;
        }
    } catch {}
    try {
        const storeContact = sock.store?.contacts?.[lidJid];
        if (storeContact?.id && storeContact.id.includes('@s.whatsapp.net')) {
            const resolved = storeContact.id.split('@')[0];
            lidToPhoneMap[lidJid] = resolved;
            return resolved;
        }
    } catch {}
    return null;
}

// Start Express
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Custom OpenWA-compatible gateway (Baileys) listening on port ${PORT}`);
});

// Initialize Baileys
async function startBaileys() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['AquaTrak Bot', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[CLIENT] QR code received. Generating PNG...');
            try {
                latestQR = await qrcode.toBuffer(qr, { type: 'png' });
            } catch (err) {
                console.error('[CLIENT] Failed to generate QR PNG:', err.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[CLIENT] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

            clientReady = false;
            latestQR = null;

            if (shouldReconnect) {
                setTimeout(() => startBaileys(), 3000);
            } else {
                console.log('[CLIENT] Logged out. Cleaning session...');
                try { rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
                console.log('[CLIENT] Exiting to let PM2 restart...');
                process.exit(1);
            }
        }

        if (connection === 'open') {
            console.log('[CLIENT] WhatsApp client is ready!');
            clientReady = true;
            latestQR = null;
            // Build LID→phone map from stored contacts
            const contacts = sock.store?.contacts || {};
            let mapCount = 0;
            for (const [jid, contact] of Object.entries(contacts)) {
                if (jid.includes('@s.whatsapp.net') && contact?.lid) {
                    lidToPhoneMap[contact.lid] = jid.split('@')[0];
                    mapCount++;
                }
            }
            console.log(`[CLIENT] Built LID→phone map with ${mapCount} entries`);
            if (mapCount === 0) {
                console.log('[CLIENT] Contacts store keys sample:', Object.keys(contacts).slice(0, 5));
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            if (!from) continue;
            if (from.endsWith('@g.us') || from === 'status@broadcast') continue;

            const isLid = from.endsWith('@lid');
            let resolvedPhone = null;
            if (isLid) {
                resolvedPhone = await resolveLidToPhone(from);
                console.log(`[CLIENT] LID ${from} → ${resolvedPhone || 'FAILED'}`);
            }

            const fromJid = resolvedPhone ? `${resolvedPhone}@s.whatsapp.net` : from;
            console.log(`[CLIENT] Message received from ${from} (resolved: ${fromJid})`);

            let latitude = null;
            let longitude = null;
            const locationMsg = msg.message?.locationMessage;
            if (locationMsg) {
                latitude = locationMsg.degreesLatitude;
                longitude = locationMsg.degreesLongitude;
            }

            const body = msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || msg.message?.imageMessage?.caption
                || msg.message?.videoMessage?.caption
                || '';

            const payload = {
                event: 'message.received',
                data: {
                    from: fromJid,
                    body,
                    location: (latitude && longitude) ? { latitude, longitude } : null,
                    fromMe: false
                },
                idempotencyKey: msg.key.id || `baileys_${Date.now()}`
            };

            await forwardToWebhook(payload);
        }
    });
}

console.log('[CLIENT] Initializing Baileys WhatsApp Client...');
startBaileys().catch(err => {
    console.error('[CLIENT] Initialization failed:', err.message);
    console.log('[CLIENT] Exiting process to let PM2 retry...');
    process.exit(1);
});
