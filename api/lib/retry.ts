import type { OpenWAConfig } from "./openwa.js";
import { sendWhatsAppMessage } from "./openwa.js";
import { log } from "./logger.js";

const COMPONENT = "retry";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWithRetry(
  config: OpenWAConfig,
  to: string,
  body: string,
  maxRetries = 3
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendWhatsAppMessage(config, to, body);
    if (result.ok) {
      if (attempt > 1) {
        log.info(COMPONENT, `Message sent on attempt ${attempt}/${maxRetries}`, { to });
      }
      return result;
    }
    lastError = result.error ?? "unknown";
    log.warn(COMPONENT, `Send failed (attempt ${attempt}/${maxRetries})`, {
      to,
      error: lastError,
    });
    if (attempt < maxRetries) {
      const delay = Math.pow(3, attempt - 1) * 1000;
      await sleep(delay);
    }
  }
  log.error(COMPONENT, `All ${maxRetries} attempts failed`, { to, error: lastError });
  return { ok: false, error: lastError };
}
