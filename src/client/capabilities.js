export const CAPABILITY_KEYS = [
  'plants',
  'rooms',
  'environment',
  'environmentHistory',
  'cameras',
  'imageAnalysis',
  'trichomeAnalysis',
  'analysisHistory',
  'alerts',
  'canopy',
  'analytics',
  'advisors',
  'aiInsights',
  'inventory',
  'harvests',
  'automationRead',
  'automationWrite',
];

function featureFlag(status, ...names) {
  const payload = status?.payload ?? status ?? {};
  const sources = [payload, payload.features, payload.supportedFeatures, payload.capabilities].filter((value) => value && typeof value === 'object');
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
  capabilities.plants = probes.plants === true || featureFlag(status, 'plants', 'plantManagement');
  capabilities.environment = probes.environment === true || featureFlag(status, 'environment', 'sensorMonitoring');
  capabilities.rooms = probes.rooms === true || featureFlag(status, 'rooms', 'roomManagement');
  capabilities.environmentHistory = probes.environmentHistory === true || featureFlag(status, 'environmentHistory', 'sensorHistory');
  capabilities.alerts = probes.alerts === true || featureFlag(status, 'alerts', 'notifications');
  capabilities.analysisHistory = probes.analysisHistory === true || featureFlag(status, 'analysisHistory', 'history');
  capabilities.canopy = probes.canopy === true || featureFlag(status, 'canopy');
  capabilities.analytics = probes.analytics === true || featureFlag(status, 'analytics', 'plantHealthAnalytics');
  capabilities.trichomeAnalysis = probes.trichomeAnalysis === true || featureFlag(status, 'trichomeAnalysis', 'trichomes');
  capabilities.cameras = probes.cameras === true || featureFlag(status, 'cameras', 'camera', 'snapshots') || (
    String(env.CAMERA_MODE ?? '').toLowerCase() === 'http' && Boolean(String(env.CAMERA_SNAPSHOT_URL_TEMPLATE ?? '').trim())
  );
  capabilities.imageAnalysis = probes.imageAnalysis === true || featureFlag(status, 'imageAnalysis', 'aiAnalysis', 'visionAnalysis') || Boolean(String(env.OPENAI_API_KEY ?? '').trim());
  return capabilities;
}
