import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("system capability tools are registered", () => {
  assert.match(serverSource, /"get_cannaai_status"/);
  assert.match(serverSource, /"get_cannaai_capabilities"/);
});

test("backend read annotations are read-only and open-world", () => {
  assert.match(serverSource, /const backendReadAnnotations = \{[\s\S]*readOnlyHint: true,[\s\S]*destructiveHint: false,[\s\S]*openWorldHint: true/);
});

test("root health response does not emit configured backend URL", () => {
  assert.match(serverSource, /backendConfigured:/);
  assert.doesNotMatch(serverSource, /baseUrl:\s*process\.env\.CANNAAI_BASE_URL/);
});
