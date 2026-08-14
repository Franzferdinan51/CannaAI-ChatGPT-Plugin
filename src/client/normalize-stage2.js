import { unwrapPayloadData } from './normalize.js';

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function normalizeRoom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? 'Unnamed room'),
    temperatureF: num(raw.temperatureF ?? raw.temp),
    humidityPct: num(raw.humidityPct ?? raw.humidity),
    co2Ppm: num(raw.co2Ppm ?? raw.co2),
    active: typeof raw.active === 'boolean' ? raw.active : null,
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
  };
}

export function normalizeRoomsResponse(payload) {
  const data = unwrapPayloadData(payload);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rooms) ? data.rooms : [];
  return rows.map(normalizeRoom).filter((room) => room?.id);
}

export function normalizeAlert(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? ''),
    sensorId: raw.sensorId == null ? null : String(raw.sensorId),
    type: String(raw.type ?? 'unknown'),
    severity: String(raw.severity ?? 'info').toLowerCase(),
    message: String(raw.message ?? ''),
    acknowledged: Boolean(raw.acknowledged),
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
  };
}

export function normalizeAlertsResponse(payload) {
  const data = unwrapPayloadData(payload);
  const rows = Array.isArray(data) ? data : Array.isArray(payload?.alerts) ? payload.alerts : [];
  return rows.map(normalizeAlert).filter((alert) => alert?.id);
}

export function normalizeSensorHistory(payload) {
  const data = unwrapPayloadData(payload);
  const rows = Array.isArray(payload?.readings) ? payload.readings : Array.isArray(data?.readings) ? data.readings : Array.isArray(data) ? data : [];
  return rows.map((reading) => {
    const detail = reading?.data && typeof reading.data === 'object' ? reading.data : {};
    return {
      timestamp: iso(reading?.timestamp ?? reading?.createdAt),
      temperatureF: num(detail.temperature ?? detail.temperatureF ?? reading?.temperatureF ?? reading?.value),
      humidityPct: num(detail.humidity ?? detail.humidityPct ?? reading?.humidityPct),
      vpdKpa: num(detail.vpd ?? detail.vpdKpa ?? reading?.vpdKpa),
      co2Ppm: num(detail.co2 ?? detail.co2Ppm ?? reading?.co2Ppm),
      light: num(detail.light ?? reading?.light),
      source: detail.source == null ? null : String(detail.source),
      roomId: (detail.roomId ?? reading?.roomId) == null ? null : String(detail.roomId ?? reading.roomId),
      sensorId: reading?.sensorId == null ? null : String(reading.sensorId),
    };
  }).filter((reading) => reading.timestamp || Object.entries(reading).some(([k, v]) => k !== 'timestamp' && v !== null));
}

function recommendations(raw) {
  const value = raw?.recommendations ?? raw?.result?.recommendations ?? raw?.result?.treatment ?? null;
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.overall)) return value.overall.map(String);
    return Object.values(value).flatMap((v) => Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]).slice(0, 20);
  }
  return value == null ? [] : [String(value)];
}

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = raw.result && typeof raw.result === 'object' ? raw.result : null;
  return {
    id: String(raw.id ?? raw.analysisId ?? ''),
    plantId: raw.plantId == null ? null : String(raw.plantId),
    diagnosis: String(raw.diagnosis ?? result?.diagnosis ?? result?.analysis?.diagnosis ?? 'Unknown'),
    urgency: raw.urgency == null ? (result?.urgency == null ? null : String(result.urgency)) : String(raw.urgency),
    confidence: num(raw.confidence ?? result?.confidence ?? raw.metadata?.confidence),
    healthScore: num(raw.healthScore ?? result?.healthScore),
    recommendations: recommendations(raw),
    provider: raw.provider == null ? (raw.metadata?.provider == null ? null : String(raw.metadata.provider)) : String(raw.provider),
    createdAt: iso(raw.createdAt ?? raw.date ?? raw.timestamp),
    result,
  };
}

export function normalizeAnalysesResponse(payload) {
  const data = unwrapPayloadData(payload);
  const rows = Array.isArray(data) ? data : Array.isArray(payload?.history) ? payload.history : [];
  return rows.map(normalizeAnalysis).filter((analysis) => analysis?.id);
}

export function normalizeAnalysisHistory(payload) {
  const rows = Array.isArray(payload?.history) ? payload.history : Array.isArray(unwrapPayloadData(payload)) ? unwrapPayloadData(payload) : [];
  return rows.map(normalizeAnalysis).filter((analysis) => analysis?.id);
}

export function normalizePlantHealthAnalytics(payload) {
  const data = unwrapPayloadData(payload) ?? {};
  const summary = data.summary ?? {};
  const records = Array.isArray(data.healthData) ? data.healthData.map((row) => ({
    id: String(row.id ?? ''),
    plantId: row.plantId == null ? null : String(row.plantId),
    plantName: row.plant?.name == null ? null : String(row.plant.name),
    healthScore: num(row.healthScore),
    healthStatus: row.healthStatus == null ? null : String(row.healthStatus),
    timestamp: iso(row.timestamp),
  })).filter((row) => row.id) : [];
  const trendData = Array.isArray(summary.trendData) ? summary.trendData.map((row) => ({
    date: row.date == null ? null : String(row.date),
    avgScore: num(row.avgScore),
    minScore: num(row.minScore),
    maxScore: num(row.maxScore),
    count: num(row.count),
  })) : [];
  const topIssues = Array.isArray(data.topIssues) ? data.topIssues.map((row) => ({ issue: String(row.issue ?? 'unknown'), count: num(row.count) ?? 0 })) : [];
  return {
    timeframe: String(data.timeframe ?? '7d'),
    summary: {
      avgHealthScore: num(summary.avgHealthScore),
      totalAnalyses: num(summary.totalAnalyses) ?? 0,
      statusDistribution: summary.statusDistribution && typeof summary.statusDistribution === 'object' ? summary.statusDistribution : {},
      trendData,
    },
    topIssues,
    records,
    plantStats: data.plantStats ?? null,
    dateRange: data.dateRange ?? null,
  };
}

export function normalizeCanopyStatus(payload) {
  const data = unwrapPayloadData(payload) ?? {};
  return {
    coveragePct: num(data.coverage ?? data.coveragePct),
    height: num(data.height),
    width: num(data.width),
    density: data.density == null ? null : String(data.density),
    source: 'cannaai',
  };
}

export function normalizeTrichomeCapabilities(payload) {
  const data = payload?.capabilities ?? unwrapPayloadData(payload)?.capabilities ?? unwrapPayloadData(payload) ?? {};
  return {
    status: payload?.status == null ? null : String(payload.status),
    supportedDevices: Array.isArray(data.supportedDevices) ? data.supportedDevices : [],
    analysisOptions: data.analysisOptions && typeof data.analysisOptions === 'object' ? data.analysisOptions : {},
    performance: data.performance && typeof data.performance === 'object' ? data.performance : {},
    updatedAt: iso(payload?.timestamp),
  };
}

function average(rows, key) {
  const values = rows.map((row) => num(row[key])).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function summarizeEnvironmentSeries(rows) {
  return {
    count: rows.length,
    temperatureF: average(rows, 'temperatureF'),
    humidityPct: average(rows, 'humidityPct'),
    vpdKpa: average(rows, 'vpdKpa'),
    co2Ppm: average(rows, 'co2Ppm'),
    light: average(rows, 'light'),
    from: rows[0]?.timestamp ?? null,
    to: rows.at(-1)?.timestamp ?? null,
  };
}

export function compareEnvironmentSeries(seriesA, seriesB) {
  const a = summarizeEnvironmentSeries(seriesA);
  const b = summarizeEnvironmentSeries(seriesB);
  const delta = {};
  for (const key of ['temperatureF', 'humidityPct', 'vpdKpa', 'co2Ppm', 'light']) {
    delta[key] = a[key] === null || b[key] === null ? null : b[key] - a[key];
  }
  return { a, b, delta };
}

export function summarizeAlerts(alerts) {
  const severityDistribution = {};
  const unacknowledged = alerts.filter((alert) => !alert.acknowledged);
  for (const alert of alerts) severityDistribution[alert.severity] = (severityDistribution[alert.severity] ?? 0) + 1;
  return {
    total: alerts.length,
    unacknowledged: unacknowledged.length,
    severityDistribution,
    urgent: unacknowledged.filter((alert) => ['critical', 'high'].includes(alert.severity)).slice(0, 10),
  };
}
