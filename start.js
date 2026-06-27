// DIY OpenWA QR Generator - No npm dependencies
const puppeteer = require('puppeteer-core');
const express = require('express');
const fs = require('fs');

let latestQR = null;
const app = express();
app.use(express.json());

// Simple QR server
app.get('/qr', (req, res) => latestQR ? res.writeHead(200, {'Content-Type':'image/png'}).end(latestQR) : res.status(404).json({status:'qr_not_ready'}));
app.get('/health', (req, res) => res.json({server:'running',hasQR:!!latestQR}));
app.listen(2785, '0.0.0.0', () => console.log('[SERVER] Listening on port 2785'));

async function captureQR() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 60000 });

    for (let i = 0; i < 180; i++) {
      try {
        const canvas = await page.$('canvas[aria-label]');
        if (canvas) {
          const qrBase64 = await page.evaluate((el) => el.toDataURL('image/png').split(',')[1], canvas);
          if (qrBase64 && qrBase64.length > 1000) {
            latestQR = Buffer.from(qrBase64, 'base64');
            console.log('[QR] Captured ' + latestQR.length + ' bytes');
            console.log('[QR] Access at http://<VM_IP>:2785/qr');
            return;
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    console.error('[QR] Failed to capture QR');
  } catch (err) {
    console.error('[QR] Error:', err.message);
  }
}

captureQR();
