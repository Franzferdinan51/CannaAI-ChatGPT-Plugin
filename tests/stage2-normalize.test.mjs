import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoomsResponse, normalizeAlertsResponse, normalizeSensorHistory,
  normalizeAnalysesResponse, normalizeAnalysisHistory, normalizePlantHealthAnalytics,
  normalizeCanopyStatus, normalizeTrichomeCapabilities, compareEnvironmentSeries, summarizeAlerts,
} from '../src/client/normalize-stage2.js';

test('normalizes rooms from CannaAI room records', () => {
  const rooms = normalizeRoomsResponse({ success: true, data: [{ id: 'r1', name: 'Flower', temp: 78, humidity: 52, co2: 900, active: true }] });
  assert.deepEqual(rooms[0], { id: 'r1', name: 'Flower', temperatureF: 78, humidityPct: 52, co2Ppm: 900, active: true, createdAt: null, updatedAt: null });
});

test('normalizes and summarizes alerts', () => {
  const alerts = normalizeAlertsResponse({ success: true, data: [
    { id: 'a1', type: 'HIGH_TEMP', severity: 'HIGH', message: 'Hot', acknowledged: false },
    { id: 'a2', type: 'LOW_HUMIDITY', severity: 'warning', message: 'Dry', acknowledged: true },
  ] });
  const summary = summarizeAlerts(alerts);
  assert.equal(alerts[0].severity, 'high');
  assert.equal(summary.total, 2);
  assert.equal(summary.unacknowledged, 1);
  assert.equal(summary.urgent[0].id, 'a1');
});

test('normalizes Stage 2 sensor payload as Fahrenheit history', () => {
  const rows = normalizeSensorHistory({ success: true, readings: [{
    id: 'x', sensorId: 'room-1', value: 79, timestamp: '2026-08-13T20:00:00Z',
    data: { temperature: 79, humidity: 51, vpd: 1.4, co2: 950, light: 700, source: 'openclaw', roomId: 'room-1' },
  }] });
  assert.equal(rows[0].temperatureF, 79);
  assert.equal(rows[0].humidityPct, 51);
  assert.equal(rows[0].roomId, 'room-1');
});

test('environment comparison calculates averages and deltas only from present metrics', () => {
  const result = compareEnvironmentSeries(
    [{ temperatureF: 76, humidityPct: 50 }, { temperatureF: 78, humidityPct: 54 }],
    [{ temperatureF: 80, humidityPct: 56 }, { temperatureF: 82, humidityPct: 58 }],
  );
  assert.equal(result.a.temperatureF, 77);
  assert.equal(result.b.temperatureF, 81);
  assert.equal(result.delta.temperatureF, 4);
  assert.equal(result.delta.vpdKpa, null);
});

test('normalizes stored plant analyses including result envelopes', () => {
  const rows = normalizeAnalysesResponse({ success: true, data: [{ id: 'an1', plantId: 'p1', provider: 'local', result: { diagnosis: 'Healthy', confidence: 0.91, healthScore: 88, recommendations: ['Keep steady'] }, createdAt: '2026-08-13T00:00:00Z' }] });
  assert.equal(rows[0].diagnosis, 'Healthy');
  assert.equal(rows[0].healthScore, 88);
  assert.deepEqual(rows[0].recommendations, ['Keep steady']);
});

test('normalizes legacy global analysis history', () => {
  const rows = normalizeAnalysisHistory({ success: true, history: [{ id: 'h1', strain: 'X', diagnosis: 'Healthy', confidence: 85, healthScore: 75, date: '2026-08-13T00:00:00Z' }] });
  assert.equal(rows[0].id, 'h1');
  assert.equal(rows[0].diagnosis, 'Healthy');
});

test('normalizes plant health analytics', () => {
  const data = normalizePlantHealthAnalytics({ success: true, data: {
    healthData: [{ id: 'x', plantId: 'p1', healthScore: 87, healthStatus: 'healthy', timestamp: '2026-08-13T00:00:00Z', plant: { name: 'P1' } }],
    summary: { avgHealthScore: 87, totalAnalyses: 1, statusDistribution: { healthy: 1 }, trendData: [{ date: '2026-08-13', avgScore: 87, minScore: 87, maxScore: 87, count: 1 }] },
    topIssues: [{ issue: 'none', count: 1 }], timeframe: '7d',
  } });
  assert.equal(data.summary.avgHealthScore, 87);
  assert.equal(data.records[0].plantName, 'P1');
});

test('normalizes canopy and trichome capability responses', () => {
  const canopy = normalizeCanopyStatus({ success: true, data: { coverage: 85, height: 45, width: 36, density: 'medium' } });
  assert.equal(canopy.coveragePct, 85);
  const tri = normalizeTrichomeCapabilities({ success: true, status: 'active', capabilities: { supportedDevices: [{ type: 'USB Microscope' }], analysisOptions: { focusAreas: ['trichomes'] }, performance: { processingTime: '3-5 seconds' } } });
  assert.equal(tri.status, 'active');
  assert.equal(tri.supportedDevices.length, 1);
});
