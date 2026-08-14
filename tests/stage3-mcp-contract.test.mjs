import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/tools/stage3.js', import.meta.url), 'utf8').catch(() => '');
const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');

const tools = ['get_advisor_status', 'ask_cannaai_advisor', 'get_ai_insights', 'get_inventory_summary', 'list_inventory_items'];

test('Stage 3 MCP registry contains verified advisor/insight/inventory tools', () => {
  for (const name of tools) assert.match(source, new RegExp(`['\"]${name}['\"]`), name);
});

test('Stage 3 tools are non-destructive open-world operations', () => {
  assert.match(source, /readOnlyHint: true/);
  assert.match(source, /destructiveHint: false/);
  assert.match(source, /openWorldHint: true/);
});

test('Stage 3 registry is registered and version is 0.4.0', () => {
  assert.match(serverSource, /registerStage3Tools\(server\)/);
  assert.match(serverSource, /PLUGIN_VERSION = "0\.4\.0"/);
});
