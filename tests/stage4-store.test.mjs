import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { CannaAIError } from '../src/client/errors.js';

const apiConfig = { mode: 'api', baseUrl: 'http://cannaai.local', apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };

function overviewClient({ failAlerts = false } = {}) {
  return {
    listRooms: async () => ({ success: true, data: [{ id: 'r1', name: 'Flower', temp: 78, humidity: 52, co2: 900, active: true }] }),
    listPlants: async () => ({ success: true, data: { plants: [{ id: 'p1', name: 'Purple Sunshine #1', locationId: 'r1', strain: { name: 'Purple Sunshine' } }], pagination: {} } }),
    listAlerts: async () => {
      if (failAlerts) throw new CannaAIError('CANNAAI_UNAVAILABLE', 'alerts unavailable');
      return { success: true, data: [{ id: 'a1', type: 'HIGH_TEMP', severity: 'high', message: 'Hot', acknowledged: false }] };
    },
    getAiInsights: async () => ({ insights: [], summary: 'Conditions stable', co_pilot_response: 'No urgent trend detected.', latest_readings: { temperature: 78, humidity: 52 } }),
    getInventory: async () => ({ success: true, inventory: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }], statistics: { totalValue: 10, totalItems: 1, lowStockCount: 1, categoryBreakdown: { Nutrients: 10 } }, lowStockItems: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }] }),
  };
}

test('grow overview aggregates rooms plants alerts insights and inventory', async () => {
  const store = createStore({ config: apiConfig, client: overviewClient(), env: {} });
  const overview = await store.getGrowOverview({ insightHours: 48 });
  assert.equal(overview.rooms.length, 1);
  assert.equal(overview.plants.length, 1);
  assert.equal(overview.alertSummary.unacknowledged, 1);
  assert.equal(overview.aiInsights.summary, 'Conditions stable');
  assert.equal(overview.inventory.statistics.lowStockCount, 1);
});

test('grow overview survives an optional slice failure', async () => {
  const store = createStore({ config: apiConfig, client: overviewClient({ failAlerts: true }), env: {} });
  const overview = await store.getGrowOverview();
  assert.equal(overview.rooms[0].id, 'r1');
  assert.equal(overview.plants[0].id, 'p1');
  assert.equal(overview.alertSummary, null);
  assert.equal(overview.aiInsights.summary, 'Conditions stable');
});
