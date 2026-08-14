import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/tools/stage4-views.js', import.meta.url), 'utf8').catch(() => '');
const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');

const tools = ['render_grow_overview', 'render_environment_trends', 'render_alerts_dashboard', 'render_plant_analysis'];
const resources = ['grow-overview-v1.html', 'environment-trends-v1.html', 'alerts-v1.html', 'analysis-v1.html'];

test('Stage 4 registers all focused render tools and resources', () => {
  for (const name of tools) assert.match(source, new RegExp(name), name);
  for (const resource of resources) assert.match(source, new RegExp(resource.replace('.', '\\.')), resource);
});

test('Stage 4 views are read-only open-world tools', () => {
  assert.match(source, /readOnlyHint: true/);
  assert.match(source, /destructiveHint: false/);
  assert.match(source, /openWorldHint: true/);
});

test('Stage 4 registry is attached and version advances to 0.5.0', () => {
  assert.match(serverSource, /registerStage4Views\(server\)/);
  assert.match(serverSource, /PLUGIN_VERSION = "0\.5\.0"/);
});
