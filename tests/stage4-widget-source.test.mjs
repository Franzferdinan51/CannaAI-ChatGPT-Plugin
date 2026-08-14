import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'grow-overview-widget.html',
  'environment-trends-widget.html',
  'alerts-widget.html',
  'analysis-widget.html',
];

async function source(name) {
  return readFile(new URL(`../public/${name}`, import.meta.url), 'utf8').catch(() => '');
}

test('Stage 4 widgets contain no direct tool mutation calls', async () => {
  for (const name of files) {
    const html = await source(name);
    assert.ok(html.length > 100, `${name} should exist`);
    assert.doesNotMatch(html, /execute_automation_action|preview_automation_action|tools\/call/);
  }
});

test('every Stage 4 widget has a ChatGPT follow-up path', async () => {
  for (const name of files) {
    const html = await source(name);
    assert.match(html, /sendFollowUpMessage|ui\/message/, name);
  }
});

test('environment trend widget uses finite-value guards and SVG rendering', async () => {
  const html = await source('environment-trends-widget.html');
  assert.match(html, /finiteValues/);
  assert.match(html, /createElementNS/);
  assert.match(html, /values\.length/);
});
