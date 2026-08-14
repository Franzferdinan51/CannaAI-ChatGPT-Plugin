import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { CannaAIError } from '../src/client/errors.js';

const apiConfig = { mode: 'api', baseUrl: 'http://cannaai.local', apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };
const mockConfig = { mode: 'mock', baseUrl: null, apiToken: null, timeoutMs: 15000, writeToolsEnabled: false, automationEnabled: false };

function stage3Client() {
  return {
    getAdvisorStatus: async () => ({ success: true, workflow: 'planner → skeptic → synthesizer', providers: [{ id: 'lm-studio', status: 'healthy', healthy: true, capabilities: ['chat'] }] }),
    runAdvisor: async () => ({ success: true, answer: 'Hold steady.', stages: [{ role: 'aggregator', content: 'Hold steady.', provider: 'lm-studio', model: 'qwen', latency: 150 }] }),
    getAiInsights: async () => ({ insights: [{ id: 'vpd-rising', severity: 'medium', type: 'vpd', title: 'VPD rising', description: 'Watch it', predicted_cause: 'Dry air', recommended_actions: ['Check RH'], source_readings: 6 }], summary: '1 insight', co_pilot_response: 'Monitor VPD.', latest_readings: { vpd: 1.4, temperature: 79, humidity: 51 } }),
    getInventory: async () => ({ success: true, inventory: [
      { id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 },
      { id: 2, name: 'Light', category: 'Equipment', quantity: 2, unit: 'units', cost: 300, lowStockThreshold: 1 },
    ], statistics: { totalValue: 610, totalItems: 2, lowStockCount: 1, categoryBreakdown: { Nutrients: 10, Equipment: 600 } }, lowStockItems: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }] }),
  };
}

test('reads advisor status and runs CannaAI advisor workflow', async () => {
  const store = createStore({ config: apiConfig, client: stage3Client(), env: {} });
  const status = await store.getAdvisorStatus();
  assert.equal(status.providers[0].id, 'lm-studio');
  const advice = await store.askCannaAiAdvisor({ task: 'Check grow' });
  assert.equal(advice.answer, 'Hold steady.');
  assert.equal(advice.stages[0].provider, 'lm-studio');
});

test('reads predictive AI insights with bounded hours', async () => {
  let seenHours = null;
  const client = stage3Client();
  client.getAiInsights = async ({ hours }) => {
    seenHours = hours;
    return { insights: [], summary: 'clear', co_pilot_response: 'All clear', latest_readings: {} };
  };
  const store = createStore({ config: apiConfig, client, env: {} });
  const insights = await store.getAiInsights({ hours: 999 });
  assert.equal(seenHours, 168);
  assert.equal(insights.summary, 'clear');
});

test('inventory summary and filtering use backend data without mutation', async () => {
  const client = stage3Client();
  const store = createStore({ config: apiConfig, client, env: {} });
  const summary = await store.getInventorySummary();
  assert.equal(summary.statistics.totalValue, 610);
  const low = await store.listInventoryItems({ category: 'nutrients', lowStockOnly: true });
  assert.deepEqual(low.map((item) => item.name), ['Cal-Mag']);
  const all = await store.listInventoryItems();
  assert.equal(all.length, 2);
});

test('Stage 3 capabilities fail closed independently and harvests stays false', async () => {
  const client = stage3Client();
  const store = createStore({ config: apiConfig, client, env: {} });
  const caps = await store.getCapabilities();
  assert.equal(caps.advisors, true);
  assert.equal(caps.aiInsights, true);
  assert.equal(caps.inventory, true);
  assert.equal(caps.harvests, false);
});

test('missing Stage 3 methods do not accidentally enable capabilities', async () => {
  const store = createStore({ config: apiConfig, client: {}, env: {} });
  const caps = await store.getCapabilities();
  assert.equal(caps.advisors, false);
  assert.equal(caps.aiInsights, false);
  assert.equal(caps.inventory, false);
  assert.equal(caps.harvests, false);
});

test('mock mode keeps remote advisor/insight/inventory capabilities disabled', async () => {
  const store = createStore({ config: mockConfig, env: {} });
  const caps = await store.getCapabilities();
  assert.equal(caps.advisors, false);
  assert.equal(caps.aiInsights, false);
  assert.equal(caps.inventory, false);
  await assert.rejects(() => store.askCannaAiAdvisor({ task: 'x' }), (error) => {
    assert.ok(error instanceof CannaAIError);
    assert.equal(error.code, 'CANNAAI_UNSUPPORTED');
    return true;
  });
});
