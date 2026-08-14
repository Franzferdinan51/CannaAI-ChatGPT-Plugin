const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;

function parseBoolean(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseTimeout(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
    throw new Error(`CANNAAI_REQUEST_TIMEOUT_MS must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("CANNAAI_BASE_URL must be a valid http:// or https:// URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("CANNAAI_BASE_URL must use http:// or https://.");
  }
  return raw.replace(/\/+$/, "");
}

export function getConfig(env = process.env) {
  const mode = String(env.CANNAAI_MODE ?? "mock").trim().toLowerCase();
  if (!["mock", "api"].includes(mode)) {
    throw new Error("CANNAAI_MODE must be either mock or api.");
  }

  const baseUrl = normalizeBaseUrl(env.CANNAAI_BASE_URL);
  if (mode === "api" && !baseUrl) {
    throw new Error("CANNAAI_BASE_URL is required when CANNAAI_MODE=api.");
  }

  return {
    mode,
    baseUrl,
    apiToken: String(env.CANNAAI_API_TOKEN ?? "").trim() || null,
    timeoutMs: parseTimeout(env.CANNAAI_REQUEST_TIMEOUT_MS),
    writeToolsEnabled: parseBoolean(env.CANNAAI_ENABLE_WRITE_TOOLS),
    automationEnabled: parseBoolean(env.CANNAAI_ENABLE_AUTOMATION),
  };
}
