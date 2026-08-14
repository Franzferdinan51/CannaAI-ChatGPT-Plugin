import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CannaAIClient } from '../src/client/cannaai-client.js';
import { createStore } from '../src/store.js';

async function withServer(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { return await fn(`http://127.0.0.1:${address.port}`); }
  finally { server.close(); await once(server, 'close'); }
}

function json(res, payload, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

test('Stage 2 store integrates end-to-end with CannaAI-shaped HTTP routes', async () => {
  await withServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return json(res, { success: false }, 404);
    if (url.pathname === '/api/plants' && url.searchParams.has('page')) return json(res, { success: true, data: { plants: [{ id: 'p1', name: 'P1', locationId: 'r1', strain: { name: 'Purple Sunshine' } }], pagination: { total: 1 } } });
    if (url.pathname === '/api/plants/p1') return json(res, { success: true, data: { id: 'p1', name: 'P1', locationId: 'r1' } });
    if (url.pathname === '/api/environment') return json(res, { success: true, data: { readings: [] } });
    if (url.pathname === '/api/rooms') return json(res, { success: true, data: [{ id: 'r1', name: 'Flower', temp: 78, humidity: 52, co2: 900, active: true }] });
    if (url.pathname === '/api/rooms/r1') return json(res, { success: true, data: { id: 'r1', name: 'Flower', temp: 78, humidity: 52, co2: 900, active: true } });
    if (url.pathname === '/api/sensors') return json(res, { success: true, readings: [{ sensorId: 'r1', value: 79, timestamp: '2026-08-13T20:00:00Z', data: { temperature: 79, humidity: 53, vpd: 1.35, co2: 920, light: 710, roomId: 'r1' } }] });
    if (url.pathname === '/api/alerts') return json(res, { success: true, data: [{ id: 'a1', sensorId: 'r1', type: 'HIGH_TEMP', severity: 'high', message: 'Hot', acknowledged: false }] });
    if (url.pathname === '/api/plants/p1/analyses') return json(res, { success: true, data: [{ id: 'an1', plantId: 'p1', diagnosis: 'Healthy', confidence: 0.9, healthScore: 88 }] });
    if (url.pathname === '/api/history') return json(res, { success: true, history: [{ id: 'h1', diagnosis: 'Healthy', confidence: 90, healthScore: 80, date: '2026-08-13T00:00:00Z' }] });
    if (url.pathname === '/api/analytics/plant-health') return json(res, { success: true, data: { healthData: [{ id: 'ph1', plantId: 'p1', healthScore: 88, healthStatus: 'healthy', timestamp: '2026-08-13T00:00:00Z' }], summary: { avgHealthScore: 88, totalAnalyses: 1, statusDistribution: { healthy: 1 }, trendData: [] }, topIssues: [], timeframe: url.searchParams.get('timeframe') ?? '7d' } });
    if (url.pathname === '/api/canopy') return json(res, { success: true, data: { coverage: 85, height: 45, width: 36, density: 'medium' } });
    if (url.pathname === '/api/trichome-analysis') return json(res, { success: true, status: 'active', capabilities: { supportedDevices: [{ type: 'USB Microscope' }], analysisOptions: {}, performance: {} }, timestamp: '2026-08-13T00:00:00Z' });
    return json(res, { success: false }, 404);
  }, async (baseUrl) => {
    const client = new CannaAIClient({ baseUrl, timeoutMs: 2000, retryDelayMs: 0 });
    const store = createStore({ config: { mode: 'api', baseUrl, apiToken: null, timeoutMs: 2000, writeToolsEnabled: false, automationEnabled: false }, client, env: {} });
    assert.equal((await store.listRooms())[0].name, 'Flower');
    assert.equal((await store.getRoom('r1')).temperatureF, 78);
    assert.equal((await store.getEnvironmentHistory({ roomId: 'r1' }))[0].vpdKpa, 1.35);
    assert.equal((await store.listAlerts())[0].id, 'a1');
    assert.equal((await store.getAlert('a1')).severity, 'high');
    assert.equal((await store.getPlantAnalyses('p1'))[0].healthScore, 88);
    assert.equal((await store.getAnalysisHistory())[0].id, 'h1');
    assert.equal((await store.getPlantHealthAnalytics({ timeframe: '7d', plantId: 'p1' })).summary.avgHealthScore, 88);
    assert.equal((await store.getCanopyStatus()).coveragePct, 85);
    assert.equal((await store.getTrichomeCapabilities()).status, 'active');
    const caps = await store.getCapabilities();
    assert.equal(caps.rooms, true);
    assert.equal(caps.environmentHistory, true);
    assert.equal(caps.alerts, true);
    assert.equal(caps.analysisHistory, true);
    assert.equal(caps.analytics, true);
    assert.equal(caps.canopy, true);
    assert.equal(caps.trichomeAnalysis, true);
  });
});
