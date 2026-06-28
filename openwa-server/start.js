import express from 'express';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import { readFileSync, rmSync } from 'fs';

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

let latestQR = null;
let clientReady = false;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: SESSION_ID,
        dataPath: './.wwebjs_auth'
    }),
    authTimeoutMs: 600000,
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome',
        protocolTimeout: 120000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--disable-features=site-per-process',
            '--single-process',
            '--js-flags="--max-old-space-size=64"',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
        ]
    }
});

// Middleware for API key check
const apiKeyCheck = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (API_KEY && apiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};

// Routes
app.get('/health', (req, res) => {
    res.json({
        status: clientReady ? 'ok' : 'initializing',
        whatsapp: clientReady ? 'connected' : 'disconnected',
        hasQR: !!latestQR
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: clientReady ? 'ok' : 'initializing' });
});

// GET /qr - directly displays the PNG QR code (makes manual scanning easy)
app.get('/qr', (req, res) => {
    if (latestQR) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(latestQR);
    } else {
        res.status(404).send('QR code not ready or client is already connected.');
    }
});

// GET /api/sessions/:sessionId/qr - returns base64 QR code JSON (matches OpenWA format)
app.get('/api/sessions/:sessionId/qr', apiKeyCheck, (req, res) => {
    if (latestQR) {
        const qrBase64 = latestQR.toString('base64');
        res.json({ qrCode: `data:image/png;base64,${qrBase64}` });
    } else {
        res.status(404).json({ error: 'QR code not ready or client is already connected.' });
    }
});

// GET /api/sessions/:sessionId - health check endpoint used by the bot server
app.get('/api/sessions/:sessionId', apiKeyCheck, (req, res) => {
    if (clientReady) {
        res.json({ status: 'CONNECTED' });
    } else {
        res.status(503).json({ status: 'INITIALIZING', error: 'WhatsApp client is not ready' });
    }
});

// GET /api/sessions/:sessionId/contacts/:jid - gets contact details (specifically JID resolution)
app.get('/api/sessions/:sessionId/contacts/:jid', apiKeyCheck, async (req, res) => {
    const { jid } = req.params;
    try {
        const contact = await client.getContactById(jid);
        if (contact) {
            res.json({
                id: contact.id._serialized,
                name: contact.name,
                number: contact.number
            });
        } else {
            res.status(404).json({ error: 'Contact not found' });
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
    
    console.log(`[CLIENT] Initiating async send message to ${chatId}`);
    
    // Send message asynchronously in the background
    client.sendMessage(chatId, text)
        .then(msg => {
            console.log(`[CLIENT] Successfully sent message to ${chatId} (ID: ${msg.id._serialized})`);
        })
        .catch(err => {
            console.error(`[CLIENT] Async send error to ${chatId}:`, err.message);
        });

    // Return success immediately to prevent bot server from timing out and retrying
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

// WhatsApp events
client.on('qr', (qr) => {
    console.log('[CLIENT] QR code received. Generating PNG...');
    qrcode.toBuffer(qr, { type: 'png' }, (err, buffer) => {
        if (!err) {
            latestQR = buffer;
        } else {
            console.error('[CLIENT] Failed to generate QR PNG buffer:', err.message);
        }
    });
});

client.on('ready', () => {
    console.log('[CLIENT] WhatsApp client is ready!');
    clientReady = true;
    latestQR = null;
});

client.on('auth_failure', (msg) => {
    console.error('[CLIENT] Auth failure:', msg);
    clientReady = false;
    latestQR = null;
});

client.on('disconnected', (reason) => {
    console.error('[CLIENT] WhatsApp client disconnected:', reason);
    clientReady = false;
    latestQR = null;
    try {
        console.log('[CLIENT] Cleaning up session directory...');
        rmSync('./.wwebjs_auth', { recursive: true, force: true });
    } catch (e) {}
    // Exit process so PM2 restarts it cleanly
    console.log('[CLIENT] Exiting process to let PM2 restart client...');
    process.exit(1);
});

client.on('message', async (msg) => {
    if (msg.fromMe) return;
    if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

    console.log(`[CLIENT] Message received from ${msg.from}`);

    let latitude = null;
    let longitude = null;
    if (msg.type === 'location' || msg.location) {
        latitude = msg.location?.latitude || msg.lat;
        longitude = msg.location?.longitude || msg.lng;
    }

    const payload = {
        event: 'message.received',
        data: {
            from: msg.from,
            body: msg.body,
            location: (latitude && longitude) ? { latitude, longitude } : null,
            fromMe: msg.fromMe
        },
        idempotencyKey: msg.id._serialized
    };

    await forwardToWebhook(payload);
});

// Start Express
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Custom OpenWA-compatible gateway listening on port ${PORT}`);
});

// Start WhatsApp Client
console.log('[CLIENT] Initializing WhatsApp Client...');
client.initialize().catch(err => {
    console.error('[CLIENT] Initialization failed:', err.message);
    console.log('[CLIENT] Exiting process to let PM2 retry (retaining session files)...');
    process.exit(1);
});
