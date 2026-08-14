import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';

const apiConfig = { mode: 'api', baseUrl: 'http://cannaai.local', apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };

function fullClient() {
  return {
    getStatus: async () => ({ reachable: true, healthRoute: false, payload: null }),
    listPlants: async () => ({ success: true, data: { plants: [
      { id: 'p1', name: 'P1', locationId: 'r1', strain: { name: 'Purple Sunshine' } },
      { id: 'p2', name: 'P2', locationId: 'r2', strain: { name: 'Other' } },
    ], pagination: {} } }),
    getPlant: async (id) => ({ success: true, data: { id, name: id.toUpperCase(), locationId: id === 'p1' ? 'r1' : 'r2', strain: id === 'p1' ? 'Purple Sunshine' : 'Other' } }),
    getEnvironment: async () => ({ success: true, data: { readings: [] } }),
    listRooms: async () => ({ success: true, data: [
      { id: 'r1', name: 'Flower', temp: 78, humidity: 52, co2: 900, active: true },
      { id: 'r2', name: 'Veg', temp: 76, humidity: 60, co2: 700, active: true },
    ] }),
    getRoom: async (id) => ({ success: true, data: { id, name: id === 'r1' ? 'Flower' : 'Veg', temp: 78, humidity: 52, co2: 900, active: true } }),
    getSensorHistory: async ({ roomId }) => ({ success: true, readings: roomId === 'r1' ? [
      { sensorId: 'r1', value: 78, timestamp: '2026-08-13T20:00:00Z', data: { temperature: 78, humidity: 52, vpd: 1.3, co2: 900, light: 700, roomId: 'r1' } },
      { sensorId: 'r1', value: 80, timestamp: '2026-08-13T21:00:00Z', data: { temperature: 80, humidity: 54, vpd: 1.4, co2: 950, light: 720, roomId: 'r1' } },
    ] : [
      { sensorId: 'r2', value: 74, timestamp: '2026-08-13T20:00:00Z', data: { temperature: 74, humidity: 60, vpd: 1.0, co2: 700, light: 500, roomId: 'r2' } },
    ] }),
    listAlerts: async () => ({ success: true, data: [
      { id: 'a1', sensorId: 'r1', type: 'HIGH_TEMP', severity: 'high', message: 'Hot', acknowledged: false },
      { id: 'a2', sensorId: 'r2', type: 'LOW_HUMIDITY', severity: 'warning', message: 'Dry', acknowledged: true },
    ] }),
    getAlert: async (id) => ({ success: true, data: { id, sensorId: 'r1', type: 'HIGH_TEMP', severity: 'high', message: 'Hot', acknowledged: false } }),
    getPlantAnalyses: async (plantId) => ({ success: true, data: [{ id: 'an1', plantId, diagnosis: 'Healthy', confidence: 0.9, healthScore: 88 }] }),
    getAnalysisHistory: async () => ({ success: true, history: [{ id: 'h1', diagnosis: 'Healthy', confidence: 90, healthScore: 80, date: '2026-08-13T00:00:00Z' }] }),
    getPlantHealthAnalytics: async ({ plantId, timeframe }) => ({ success: true, data: {
      healthData: plantId ? [{ id: `health-${plantId}`, plantId, healthScore: plantId === 'p1' ? 90 : 80, healthStatus: 'healthy', timestamp: '2026-08-13T00:00:00Z' }] : [],
      summary: { avgHealthScore: plantId === 'p1' ? 90 : plantId === 'p2' ? 80 : 85, totalAnalyses: plantId ? 1 : 2, statusDistribution: { healthy: plantId ? 1 : 2 }, trendData: [] },
      topIssues: [], timeframe,
    } }),
    getCanopyStatus: async () => ({ success: true, data: { coverage: 85, height: 45, width: 36, density: 'medium' } }),
    getTrichomeCapabilities: async () => ({ success: true, status: 'active', capabilities: { supportedDevices: [{ type: 'USB Microscope' }], analysisOptions: {}, performance: {} } }),
  };
}

test('lists rooms and room plants', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  const rooms = await store.listRooms();
  assert.equal(rooms[0].name, 'Flower');
  const plants = await store.listRoomPlants('r1');
  assert.deepEqual(plants.map((p) => p.id), ['p1']);
});

test('compares actual sensor histories', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  const comparison = await store.compareEnvironment({ roomIdA: 'r1', roomIdB: 'r2', limit: 100 });
  assert.equal(comparison.a.temperatureF, 79);
  assert.equal(comparison.b.temperatureF, 74);
  assert.equal(comparison.delta.temperatureF, -5);
});

test('filters and summarizes active alerts', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  const high = await store.listAlerts({ severity: 'HIGH' });
  assert.equal(high.length, 1);
  const summary = await store.summarizeActiveAlerts();
  assert.equal(summary.total, 1);
  assert.equal(summary.unacknowledged, 1);
});

test('reads plant analyses and global history', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  assert.equal((await store.getPlantAnalyses('p1'))[0].id, 'an1');
  assert.equal((await store.getAnalysis('p1', 'an1')).diagnosis, 'Healthy');
  assert.equal((await store.getAnalysisHistory())[0].id, 'h1');
});

test('compares plants using backend health analytics', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  const result = await store.comparePlants({ plantIds: ['p1', 'p2'], timeframe: '30d' });
  assert.equal(result.plants[0].analytics.avgHealthScore, 90);
  assert.equal(result.plants[1].analytics.avgHealthScore, 80);
});

test('reads canopy and trichome capability state', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  assert.equal((await store.getCanopyStatus()).coveragePct, 85);
  assert.equal((await store.getTrichomeCapabilities()).status, 'active');
});

test('Stage 2 capability probes independently enable real routes', async () => {
  const store = createStore({ config: apiConfig, client: fullClient(), env: {} });
  const caps = await store.getCapabilities();
  assert.equal(caps.rooms, true);
  assert.equal(caps.environmentHistory, true);
  assert.equal(caps.alerts, true);
  assert.equal(caps.analysisHistory, true);
  assert.equal(caps.analytics, true);
  assert.equal(caps.canopy, true);
  assert.equal(caps.trichomeAnalysis, true);
  assert.equal(caps.automationWrite, false);
});

test('mock mode derives safe rooms but leaves remote-only history empty', async () => {
  const config = { mode: 'mock', baseUrl: null, apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };
  const store = createStore({ config, env: {} });
  assert.ok((await store.listRooms()).length >= 1);
  assert.deepEqual(await store.getEnvironmentHistory({ roomId: 'Demo Zone A' }), []);
  const caps = await store.getCapabilities();
  assert.equal(caps.rooms, true);
  assert.equal(caps.environmentHistory, false);
});
