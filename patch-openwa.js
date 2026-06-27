// Patch OpenWA initializer.js to work with modern WhatsApp Web (2026)
// window.Debug is no longer exposed by WhatsApp Web

const fs = require('fs');
const path = '/home/nikunjkumar05/openwa-server/node_modules/@open-wa/wa-automate/dist/controllers/initializer.js';

let content = fs.readFileSync(path, 'utf8');

// Patch 1: Replace the waitForFunction that depends on window.Debug
// Original: yield waPage.waitForFunction('window.Debug!=undefined && window.Debug.VERSION!=undefined && require');
// New: Wait for QR code div or canvas to appear (more resilient)
const oldWait = "yield waPage.waitForFunction('window.Debug!=undefined && window.Debug.VERSION!=undefined && require');";
const newWait = "yield waPage.waitForFunction('[data-testid] || canvas', { timeout: 30000 }).catch(() => {});";

if (content.includes(oldWait)) {
  content = content.replace(oldWait, newWait);
  console.log('[PATCH] Patched waitForFunction (window.Debug check)');
} else {
  console.log('[PATCH] WARNING: Could not find waitForFunction line to patch');
  // Try partial match
  const partialOld = "window.Debug!=undefined && window.Debug.VERSION!=undefined && require";
  if (content.includes(partialOld)) {
    content = content.replace(partialOld, 'true');
    console.log('[PATCH] Patched via partial match');
  }
}

// Patch 2: Force canInjectEarly to true if the check fails
// The earlyInjectionCheck may also depend on window.Debug
const oldCanInject = "const canInjectEarly = yield (0, patch_manager_1.earlyInjectionCheck)(waPage);";
const newCanInject = "const canInjectEarly = true; // Patched: force early injection";
if (content.includes(oldCanInject)) {
  content = content.replace(oldCanInject, newCanInject);
  console.log('[PATCH] Patched canInjectEarly to always be true');
}

// Patch 3: Fix the WA_VERSION evaluation to not crash
const oldWaversion = "const WA_VERSION = yield waPage.evaluate(() => window.Debug ? window.Debug.VERSION : 'I think you have been TOS_BLOCKed');";
const newWaversion = "const WA_VERSION = yield waPage.evaluate(() => window.Debug ? window.Debug.VERSION : 'unknown (patched)');";
if (content.includes(oldWaversion)) {
  content = content.replace(oldWaversion, newWaversion);
  console.log('[PATCH] Patched WA_VERSION fallback');
}

fs.writeFileSync(path, content);
console.log('[PATCH] File saved successfully');

// Verify patches
const verify = fs.readFileSync(path, 'utf8');
if (verify.includes('[data-testid] || canvas')) {
  console.log('[PATCH] Verification PASSED: waitForFunction patched');
} else {
  console.log('[PATCH] Verification FAILED: patch not found');
}
if (verify.includes('const canInjectEarly = true')) {
  console.log('[PATCH] Verification PASSED: canInjectEarly patched');
} else {
  console.log('[PATCH] Verification FAILED: canInjectEarly not patched');
}
