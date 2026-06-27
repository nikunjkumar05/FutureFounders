const puppeteer = require('puppeteer-core');

(async () => {
  console.log('[DIAG] Launching Chromium...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
  });

  console.log('[DIAG] Browser launched, opening WhatsApp Web...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    console.log('[DIAG] Navigating to web.whatsapp.com...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[DIAG] Page loaded. Waiting 10s for QR to render...');
    await new Promise(r => setTimeout(r, 10000));

    const url = page.url();
    console.log('[DIAG] Current URL:', url);

    const title = await page.title();
    console.log('[DIAG] Page title:', title);

    await page.screenshot({ path: '/tmp/wa-diag-screenshot.png', fullPage: true });
    console.log('[DIAG] Screenshot saved: /tmp/wa-diag-screenshot.png');

    const html = await page.content();
    require('fs').writeFileSync('/tmp/wa-diag-page.html', html);
    console.log('[DIAG] HTML saved: /tmp/wa-diag-page.html (' + html.length + ' chars)');

    const canvas = await page.$('canvas');
    console.log('[DIAG] Canvas element:', !!canvas);

    const qrDiv = await page.$('[data-ref]');
    console.log('[DIAG] QR data-ref:', !!qrDiv);

    const imgs = await page.$$('img');
    console.log('[DIAG] Total img elements:', imgs.length);

    const canvasCount = await page.$$eval('canvas', els => els.length);
    console.log('[DIAG] Canvas count:', canvasCount);

    const bodyText = await page.$eval('body', el => el.innerText.substring(0, 2000));
    console.log('[DIAG] Body text (first 2000 chars):', bodyText);

  } catch (err) {
    console.error('[DIAG] Error during page analysis:', err.message);
    try {
      await page.screenshot({ path: '/tmp/wa-diag-error.png', fullPage: true });
      console.log('[DIAG] Error screenshot saved: /tmp/wa-diag-error.png');
    } catch (e) {}
  }

  await browser.close();
  console.log('[DIAG] Done.');
})();
