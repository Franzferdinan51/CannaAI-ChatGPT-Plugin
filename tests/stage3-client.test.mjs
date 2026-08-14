import test from 'node:test';
import assert from 'node:assert/strict';
import { CannaAIClient } from '../src/client/cannaai-client.js';

function recordingClient() {
  const seen = [];
  const client = new CannaAIClient({
    baseUrl: 'http://cannaai.local',
    retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      seen.push({ path: url.pathname + url.search, init });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, seen };
}

test('Stage 3 read routes use verified endpoints', async () => {
  const { client, seen } = recordingClient();
  await client.getAdvisorStatus();
  await client.getAiInsights({ hours: 500 });
  await client.getInventory();
  assert.deepEqual(seen.map((x) => x.path), ['/api/advisors', '/api/ai-insights?hours=168', '/api/inventory']);
});

test('AI insight hours clamp to minimum 1', async () => {
  const { client, seen } = recordingClient();
  await client.getAiInsights({ hours: 0 });
  assert.equal(seen[0].path, '/api/ai-insights?hours=1');
});

test('advisor execution is a JSON POST and preserves explicit provider/model', async () => {
  const { client, seen } = recordingClient();
  await client.runAdvisor({ task: 'Check flowering conditions', context: 'Week 5', provider: 'lm-studio', model: 'local-model' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, '/api/advisors');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    task: 'Check flowering conditions', context: 'Week 5', provider: 'lm-studio', model: 'local-model',
  });
});
