const puppeteer = require('puppeteer-core');

(async () => {
  console.log('[DIAG] Launching Google Chrome...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    console.log('[DIAG] Navigating to web.whatsapp.com...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[DIAG] Waiting 10s for QR to render...');
    await new Promise(r => setTimeout(r, 10000));

    const url = page.url();
    console.log('[DIAG] Current URL:', url);

    const title = await page.title();
    console.log('[DIAG] Page title:', title);

    await page.screenshot({ path: '/tmp/wa-chrome-screenshot.png', fullPage: true });
    console.log('[DIAG] Screenshot saved: /tmp/wa-chrome-screenshot.png');

    const html = await page.content();
    require('fs').writeFileSync('/tmp/wa-chrome-page.html', html);
    console.log('[DIAG] HTML saved: /tmp/wa-chrome-page.html (' + html.length + ' chars)');

    const canvas = await page.$('canvas');
    console.log('[DIAG] Canvas element:', !!canvas);

    const qrDiv = await page.$('[data-ref]');
    console.log('[DIAG] QR data-ref:', !!qrDiv);

    const canvasCount = await page.$$eval('canvas', els => els.length);
    console.log('[DIAG] Canvas count:', canvasCount);

    const bodyText = await page.$eval('body', el => el.innerText.substring(0, 2000));
    console.log('[DIAG] Body text:', bodyText);

    const ua = await page.evaluate(() => navigator.userAgent);
    console.log('[DIAG] User Agent:', ua);

  } catch (err) {
    console.error('[DIAG] Error:', err.message);
    try {
      await page.screenshot({ path: '/tmp/wa-chrome-error.png', fullPage: true });
    } catch (e) {}
  }

  await browser.close();
  console.log('[DIAG] Done.');
})();
