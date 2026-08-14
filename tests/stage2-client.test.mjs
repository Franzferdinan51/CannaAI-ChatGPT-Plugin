import test from 'node:test';
import assert from 'node:assert/strict';
import { CannaAIClient } from '../src/client/cannaai-client.js';

function recordingClient() {
  const seen = [];
  const client = new CannaAIClient({
    baseUrl: 'http://cannaai.local',
    retryDelayMs: 0,
    fetchImpl: async (url) => {
      seen.push(url.pathname + url.search);
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, seen };
}

test('Stage 2 client uses exact read-only routes', async () => {
  const { client, seen } = recordingClient();
  await client.listRooms();
  await client.getRoom('room/a');
  await client.listAlerts();
  await client.getPlantAnalyses('plant/a');
  await client.getAnalysisHistory();
  await client.getCanopyStatus();
  await client.getTrichomeCapabilities();
  assert.deepEqual(seen, [
    '/api/rooms', '/api/rooms/room%2Fa', '/api/alerts',
    '/api/plants/plant%2Fa/analyses', '/api/history', '/api/canopy', '/api/trichome-analysis',
  ]);
});

test('sensor history bounds limit and prefers explicit sensor ID', async () => {
  const { client, seen } = recordingClient();
  await client.getSensorHistory({ roomId: 'r1', sensorId: 's1', limit: 900 });
  assert.equal(seen[0], '/api/sensors?limit=500&sensorId=s1');
});

test('sensor history uses room ID when no sensor ID is given', async () => {
  const { client, seen } = recordingClient();
  await client.getSensorHistory({ roomId: 'flower tent', limit: 0 });
  assert.equal(seen[0], '/api/sensors?limit=1&roomId=flower+tent');
});

test('plant health analytics validates timeframe and encodes plant ID', async () => {
  const { client, seen } = recordingClient();
  await client.getPlantHealthAnalytics({ timeframe: 'nonsense', plantId: 'p/1' });
  assert.equal(seen[0], '/api/analytics/plant-health?timeframe=7d&plantId=p%2F1');
});
