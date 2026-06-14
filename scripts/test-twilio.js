import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

const envFile = readFileSync(envPath, 'utf-8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex).trim();
  const value = trimmed.slice(eqIndex + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

async function testTwilioSend() {
  const to = process.argv[2];
  const message = process.argv[3] || 'Test from AquaTrak! Twilio integration is working.';

  if (!to) {
    console.log('Usage: node scripts/test-twilio.js +91XXXXXXXXXX [message]');
    process.exit(1);
  }

  if (!accountSid || !authToken) {
    console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env');
    process.exit(1);
  }

  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : `+91${to}`}`;

  const params = new URLSearchParams({
    To: toNumber,
    From: 'whatsapp:+14155238886',
    Body: message,
  });

  console.log(`Sending message to ${toNumber}...`);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const data = await res.json();

  if (res.ok) {
    console.log('Message sent successfully!');
    console.log(`SID: ${data.sid}`);
    console.log(`Status: ${data.status}`);
  } else {
    console.error('Failed to send message:');
    console.error(data);
    process.exit(1);
  }
}

testTwilioSend();
