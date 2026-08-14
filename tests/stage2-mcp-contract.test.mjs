import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/tools/stage2.js', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');

const toolNames = [
  'list_rooms', 'get_room', 'list_room_plants', 'get_environment_history', 'compare_environment',
  'list_alerts', 'get_alert', 'summarize_active_alerts', 'get_plant_analyses', 'get_analysis',
  'get_analysis_history', 'get_plant_health_analytics', 'compare_plants', 'get_canopy_status', 'get_trichome_capabilities',
];

test('Stage 2 MCP tool registry contains all read-only tools', () => {
  for (const name of toolNames) assert.match(source, new RegExp(`['\"]${name}['\"]`), name);
});

test('Stage 2 registry uses read-only open-world annotations', () => {
  assert.match(source, /const annotations = \{ readOnlyHint: true, destructiveHint: false, openWorldHint: true \}/);
});

test('Stage 2 registry remains registered', () => {
  assert.match(serverSource, /registerStage2Tools\(server\)/);
});
