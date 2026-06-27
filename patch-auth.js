// Patch auth.js QR capture to work without window.getQrPng
const fs = require('fs');
const path = '/home/nikunjkumar05/openwa-server/node_modules/@open-wa/wa-automate/dist/controllers/auth.js';

let content = fs.readFileSync(path, 'utf8');

// Patch 1: Replace the waitForFunction for getQrPng with a canvas-based capture
// Original waits for window.getQrPng which no longer exists
const oldGetQrPng = `const t = yield (0, tools_1.timePromise)(() => waPage.waitForFunction(\`window.getQrPng || false\`, { timeout: 0, polling: 'mutation' }));`;
const newGetQrPng = `const t = 0; // Patched: skip getQrPng wait`;

if (content.includes(oldGetQrPng)) {
  content = content.replace(oldGetQrPng, newGetQrPng);
  console.log('[PATCH] Replaced getQrPng wait');
} else {
  console.log('[PATCH] WARNING: getQrPng pattern not found, trying broader match');
  // Try a broader match
  const pattern = /const t = yield.*?waitForFunction.*?window\.getQrPng.*?false.*?polling.*?mutation.*?\)/;
  if (pattern.test(content)) {
    content = content.replace(pattern, 'const t = 0; // Patched');
    console.log('[PATCH] Replaced getQrPng wait (broad match)');
  }
}

// Patch 2: Replace the getQrPng() call with canvas capture
const oldGetQrCall = 'const qrPng = isLinkCode ? qrData : yield waPage.evaluate(`window.getQrPng()`);';
const newGetQrCall = `const qrPng = isLinkCode ? qrData : yield waPage.evaluate(\`(function() {
  try {
    // Try getQrPng first
    if (typeof window.getQrPng === 'function') {
      return window.getQrPng();
    }
    // Fallback: capture canvas directly
    var canvas = document.querySelector('canvas[aria-label]');
    if (!canvas) canvas = document.querySelector('canvas');
    if (!canvas) return null;
    return canvas.toDataURL('image/png').split(',')[1];
  } catch(e) { return null; }
})()\`);`;

if (content.includes(oldGetQrCall)) {
  content = content.replace(oldGetQrCall, newGetQrCall);
  console.log('[PATCH] Replaced getQrPng() call with canvas capture');
} else {
  console.log('[PATCH] WARNING: getQrPng call pattern not found, trying broader match');
  const pattern2 = /const qrPng = isLinkCode \? qrData : yield waPage\.evaluate\(`window\.getQrPng\(\)`\);/;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, newGetQrCall);
    console.log('[PATCH] Replaced getQrPng call (broad match)');
  }
}

// Patch 3: Also fix the internalQrPngLoaded check to not block
const oldInternalCheck = `if (!this._internalQrPngLoaded) {
                logging_1.log.info("Waiting for internal QR renderer to load");
                const t = 0; // Patched: skip getQrPng wait
                logging_1.log.info(\`Internal QR renderer loaded in \${t} ms\`);
                this._internalQrPngLoaded = true;
            }`;
// This was already patched by patch 1, so just verify
if (content.includes('this._internalQrPngLoaded = true')) {
  console.log('[PATCH] _internalQrPngLoaded already handled');
}

fs.writeFileSync(path, content);
console.log('[PATCH] auth.js saved');

// Verify
const verify = fs.readFileSync(path, 'utf8');
if (verify.includes('canvas.toDataURL')) {
  console.log('[PATCH] Verification PASSED: canvas capture present');
} else {
  console.log('[PATCH] Verification FAILED: canvas capture not found');
}
