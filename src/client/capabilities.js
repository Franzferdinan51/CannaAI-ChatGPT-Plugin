export const CAPABILITY_KEYS = [
  "plants",
  "rooms",
  "environment",
  "environmentHistory",
  "cameras",
  "imageAnalysis",
  "trichomeAnalysis",
  "analysisHistory",
  "alerts",
  "canopy",
  "analytics",
  "advisors",
  "aiInsights",
  "inventory",
  "harvests",
  "automationRead",
  "automationWrite",
];

function featureFlag(status, ...names) {
  const payload = status?.payload ?? status ?? {};
  const sources = [payload, payload.features, payload.supportedFeatures, payload.capabilities].filter((value) => value && typeof value === "object");
  for (const source of sources) {
    for (const name of names) {
      if (source[name] === true) return true;
    }
  }
  return false;
}

export function emptyCapabilities() {
  return Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false]));
}

export function detectCapabilities({ status = null, probes = {}, env = process.env } = {}) {
  const capabilities = emptyCapabilities();
  capabilities.plants = probes.plants === true || featureFlag(status, "plants", "plantManagement");
  capabilities.environment = probes.environment === true || featureFlag(status, "environment", "sensorMonitoring");
  capabilities.cameras = probes.cameras === true || featureFlag(status, "cameras", "camera", "snapshots") || (
    String(env.CAMERA_MODE ?? "").toLowerCase() === "http" && Boolean(String(env.CAMERA_SNAPSHOT_URL_TEMPLATE ?? "").trim())
  );
  capabilities.imageAnalysis = probes.imageAnalysis === true || featureFlag(status, "imageAnalysis", "aiAnalysis", "visionAnalysis") || Boolean(String(env.OPENAI_API_KEY ?? "").trim());
  return capabilities;
}
