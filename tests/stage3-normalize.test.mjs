import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdvisorStatus,
  normalizeAdvisorResult,
  normalizeAiInsights,
  normalizeInventory,
} from '../src/client/normalize-stage3.js';

test('normalizes advisor provider health', () => {
  const status = normalizeAdvisorStatus({
    success: true,
    workflow: 'planner → skeptic → synthesizer',
    providers: [{ id: 'lm-studio', status: 'healthy', healthy: true, capabilities: ['chat'] }],
  });
  assert.equal(status.workflow, 'planner → skeptic → synthesizer');
  assert.deepEqual(status.providers[0], { id: 'lm-studio', status: 'healthy', healthy: true, capabilities: ['chat'] });
});

test('normalizes advisor answer and stage metadata', () => {
  const result = normalizeAdvisorResult({
    success: true,
    answer: 'Keep VPD steady.',
    stages: [
      { role: 'planner', content: 'Plan', provider: 'lm-studio', model: 'qwen', latency: 120 },
      { role: 'skeptic', content: 'Check humidity', provider: 'lm-studio', model: 'qwen', latency: 140 },
      { role: 'aggregator', content: 'Keep VPD steady.', provider: 'lm-studio', model: 'qwen', latency: 160 },
    ],
  });
  assert.equal(result.answer, 'Keep VPD steady.');
  assert.equal(result.stages.length, 3);
  assert.equal(result.stages[2].role, 'aggregator');
  assert.equal(result.stages[2].latencyMs, 160);
});

test('normalizes predictive AI insights without inventing readings', () => {
  const data = normalizeAiInsights({
    insights: [{
      id: 'vpd-rising', severity: 'medium', type: 'vpd', title: 'VPD rising', description: 'Watch it',
      predicted_cause: 'Drying air', recommended_actions: ['Check humidity'], timestamp: '2026-08-13T20:00:00Z', source_readings: 6,
    }],
    summary: '1 insight generated',
    co_pilot_response: 'Monitor VPD.',
    latest_readings: { vpd: 1.4, temperature: 79.2, humidity: 51 },
  });
  assert.equal(data.insights[0].predictedCause, 'Drying air');
  assert.deepEqual(data.insights[0].recommendedActions, ['Check humidity']);
  assert.equal(data.latestReadings.temperatureF, 79.2);
  assert.equal(data.latestReadings.co2Ppm, null);
});

test('normalizes backend inventory statistics and string IDs', () => {
  const data = normalizeInventory({
    success: true,
    inventory: [
      { id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lastRestocked: '2024-05-10', lowStockThreshold: 1 },
      { id: 2, name: 'Light', category: 'Equipment', quantity: 2, unit: 'units', cost: 300, lowStockThreshold: 1 },
    ],
    statistics: { totalValue: 610, totalItems: 2, lowStockCount: 1, categoryBreakdown: { Nutrients: 10, Equipment: 600 } },
    lowStockItems: [{ id: 1, name: 'Cal-Mag', category: 'Nutrients', quantity: 0.5, unit: 'L', cost: 20, lowStockThreshold: 1 }],
  });
  assert.equal(data.items[0].id, '1');
  assert.equal(data.statistics.totalValue, 610);
  assert.equal(data.lowStockItems[0].name, 'Cal-Mag');
  assert.equal(data.source, 'cannaai-backend');
});
