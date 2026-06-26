import { getOpenWAConfig } from "../lib/openwa.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  openwa: "connected" | "error" | "not_configured";
  db: "ok" | "error";
  ai: "ok" | "not_configured";
  timestamp: string;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const result: HealthStatus = {
    status: "ok",
    openwa: "not_configured",
    db: "error",
    ai: "not_configured",
    timestamp: new Date().toISOString(),
  };

  // Check OpenWA
  try {
    const config = getOpenWAConfig();
    if (config.apiKey && config.sessionId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `${config.baseUrl}/api/sessions/${config.sessionId}`,
        {
          headers: {
            "X-API-Key": config.apiKey,
            "ngrok-skip-browser-warning": "true",
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      result.openwa = response.ok ? "connected" : "error";
    }
  } catch {
    result.openwa = "error";
  }

  // Check Supabase
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `${supabaseUrl}/rest/v1/merchants?select=id&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      result.db = response.ok ? "ok" : "error";
    }
  } catch {
    result.db = "error";
  }

  // Check AI
  const mistralKey = process.env.MISTRAL_API_KEY;
  result.ai = mistralKey ? "ok" : "not_configured";

  // Overall status
  if (result.db === "error") {
    result.status = "error";
  } else if (result.openwa === "error") {
    result.status = "degraded";
  }

  const statusCode = result.status === "error" ? 503 : 200;
  res.writeHead(statusCode, { "Content-Type": "application/json", ...corsHeaders });
  res.end(JSON.stringify(result));
}
