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

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

test('Stage 3 advisor, insights, and inventory integrate over real HTTP', async () => {
  let advisorBody = null;
  await withServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return json(res, { success: false }, 404);
    if (url.pathname === '/api/plants') return json(res, { success: true, data: { plants: [], pagination: {} } });
    if (url.pathname === '/api/advisors' && req.method === 'GET') return json(res, { success: true, workflow: 'planner → skeptic → synthesizer', providers: [{ id: 'lm-studio', status: 'healthy', healthy: true, capabilities: ['chat'] }] });
    if (url.pathname === '/api/advisors' && req.method === 'POST') {
      advisorBody = await body(req);
      return json(res, { success: true, answer: 'Hold VPD steady.', stages: [{ role: 'aggregator', content: 'Hold VPD steady.', provider: 'lm-studio', model: 'qwen', latency: 155 }] });
    }
    if (url.pathname === '/api/ai-insights') return json(res, { insights: [{ id: 'vpd-rising', severity: 'medium', type: 'vpd', title: 'VPD rising', description: 'Watch it', predicted_cause: 'Dry air', recommended_actions: ['Check RH'], timestamp: '2026-08-13T20:00:00Z', source_readings: 6 }], summary: `hours=${url.searchParams.get('hours')}`, co_pilot_response: 'Monitor VPD.', latest_readings: { vpd: 1.4, temperature: 79, humidity: 51 } });
    if (url.pathname === '/api/inventory') return json(res, { success: true, inventory: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }, { id: 2, name: 'Light', category: 'Equipment', quantity: 2, unit: 'units', cost: 300, lowStockThreshold: 1 }], statistics: { totalValue: 610, totalItems: 2, lowStockCount: 1, categoryBreakdown: { Nutrients: 10, Equipment: 600 } }, lowStockItems: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }] });
    return json(res, { success: false }, 404);
  }, async (baseUrl) => {
    const client = new CannaAIClient({ baseUrl, timeoutMs: 2000, retryDelayMs: 0 });
    const store = createStore({ config: { mode: 'api', baseUrl, apiToken: null, timeoutMs: 2000, writeToolsEnabled: false, automationEnabled: false }, client, env: {} });

    assert.equal((await store.getAdvisorStatus()).providers[0].id, 'lm-studio');
    const advice = await store.askCannaAiAdvisor({ task: 'Check flower room', context: 'Week 5', provider: 'lm-studio' });
    assert.equal(advice.answer, 'Hold VPD steady.');
    assert.deepEqual(advisorBody, { task: 'Check flower room', context: 'Week 5', provider: 'lm-studio' });

    const insights = await store.getAiInsights({ hours: 999 });
    assert.equal(insights.summary, 'hours=168');
    assert.equal(insights.latestReadings.temperatureF, 79);

    const inventory = await store.getInventorySummary();
    assert.equal(inventory.statistics.totalValue, 610);
    assert.deepEqual((await store.listInventoryItems({ lowStockOnly: true })).map((x) => x.name), ['Cal-Mag']);

    const caps = await store.getCapabilities();
    assert.equal(caps.advisors, true);
    assert.equal(caps.aiInsights, true);
    assert.equal(caps.inventory, true);
    assert.equal(caps.harvests, false);
  });
});
