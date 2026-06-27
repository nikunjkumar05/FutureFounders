// Precise patch for auth.js - replaces the getQrPng blocks
const fs = require('fs');
const path = '/home/nikunjkumar05/openwa-server/node_modules/@open-wa/wa-automate/dist/controllers/auth.js';
let content = fs.readFileSync(path, 'utf8');

// Patch 1: Replace the getQrPng wait block (lines 178-182)
const oldBlock = `            if (!this._internalQrPngLoaded) {
                logging_1.log.info("Waiting for internal QR renderer to load");
                const t = yield (0, tools_1.timePromise)(() => waPage.waitForFunction(\`window.getQrPng || false\`, { timeout: 0, polling: 'mutation' }));
                logging_1.log.info(\`Internal QR renderer loaded in \${t} ms\`);
                this._internalQrPngLoaded = true;
            }`;
const newBlock = `            if (!this._internalQrPngLoaded) {
                this._internalQrPngLoaded = true;
            }`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  console.log('[PATCH] Replaced getQrPng wait block');
} else {
  console.log('[PATCH] ERROR: getQrPng wait block not found!');
  // Try to find what's actually there
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('getQrPng') && lines[i].includes('waitForFunction')) {
      console.log('[PATCH] Found getQrPng waitForFunction at line ' + (i+1) + ': ' + lines[i].trim());
    }
    if (lines[i].includes('window.getQrPng()')) {
      console.log('[PATCH] Found getQrPng() call at line ' + (i+1) + ': ' + lines[i].trim());
    }
    if (lines[i].includes('_internalQrPngLoaded')) {
      console.log('[PATCH] Found _internalQrPngLoaded at line ' + (i+1) + ': ' + lines[i].trim());
    }
  }
}

// Patch 2: Replace window.getQrPng() with canvas capture
const oldGetQr = "const qrPng = isLinkCode ? qrData : yield waPage.evaluate(`window.getQrPng()`);";
const newGetQr = `const qrPng = isLinkCode ? qrData : yield waPage.evaluate(\`(function() {
  try {
    if (typeof window.getQrPng === 'function') return window.getQrPng();
    var c = document.querySelector('canvas[aria-label]') || document.querySelector('canvas');
    if (!c) return null;
    return c.toDataURL('image/png').split(',')[1];
  } catch(e) { return null; }
})()\`);`;

if (content.includes(oldGetQr)) {
  content = content.replace(oldGetQr, newGetQr);
  console.log('[PATCH] Replaced getQrPng() call with canvas capture');
} else {
  console.log('[PATCH] ERROR: getQrPng() call not found!');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('getQrPng()') && lines[i].includes('qrPng')) {
      console.log('[PATCH] Found qrPng assignment at line ' + (i+1) + ': ' + lines[i].trim());
    }
  }
}

fs.writeFileSync(path, content);
console.log('[PATCH] File saved');

// Verify
const verify = fs.readFileSync(path, 'utf8');
console.log('[VERIFY] getQrPng waitForFunction present: ' + verify.includes("window.getQrPng || false"));
console.log('[VERIFY] canvas toDataURL present: ' + verify.includes("canvas.toDataURL"));
console.log('[VERIFY] _internalQrPngLoaded set: ' + verify.includes("_internalQrPngLoaded = true"));
