# CannaAI ChatGPT Stage 1 Real Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixture-only data access with a backward-compatible mock-or-real-CannaAI backend layer, expose backend status/capabilities through MCP, and add deterministic tests for the client/config/normalization boundary.

**Architecture:** Keep the existing ChatGPT MCP server and tool names stable. Introduce a dependency-free `CannaAIClient` plus configuration/error/normalization modules, then make `src/store.js` select the existing JSON fixture behavior in `mock` mode or the real CannaAI HTTP API in `api` mode. Existing camera and optional OpenAI vision adapters stay separate in Stage 1.

**Tech Stack:** Node.js 20+ ESM, native `fetch`, native `AbortController`, Node test runner, Zod, `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`.

## Global Constraints

- `CANNAAI_MODE=mock` remains the safe default for a freshly cloned public repository.
- `api` mode requires `CANNAAI_BASE_URL` and never commits credentials.
- Existing MCP tool names remain backward-compatible: `list_plants`, `get_plant`, `get_environment`, `get_latest_snapshot`, `analyze_plant_snapshot`, `render_plant_dashboard`.
- All temperature summaries exposed to the user default to Fahrenheit.
- Read requests may retry one transient failure; mutation requests are out of scope for Stage 1.
- Tool output and logs must never expose `CANNAAI_API_TOKEN`, Authorization headers, or private backend URLs unnecessarily.
- The connected CannaAI backend is the source of truth in `api` mode; fixture data is only for mock/test mode.
- No new write/automation tools are introduced in Stage 1.

---

### Task 1: Configuration, errors, and HTTP client

**Files:**
- Create: `src/config.js`
- Create: `src/client/errors.js`
- Create: `src/client/cannaai-client.js`
- Test: `tests/client.test.mjs`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getConfig(env = process.env)` returning `{ mode, baseUrl, apiToken, timeoutMs, writeToolsEnabled, automationEnabled }`.
- Produces: `CannaAIError` with stable `code`, `status`, `retryable`, and optional `cause`.
- Produces: `CannaAIClient` with `request(path, options)`, `getStatus()`, `listPlants({ page, limit })`, `getPlant(plantId)`, and `getEnvironment()`.
- `request()` accepts relative `/api/...` paths only and returns parsed JSON.

- [ ] **Step 1: Write failing client/config tests**

Cover these exact behaviors with Node's built-in test runner:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getConfig } from "../src/config.js";
import { CannaAIClient } from "../src/client/cannaai-client.js";
import { CannaAIError } from "../src/client/errors.js";

test("config defaults to mock mode", () => {
  const config = getConfig({});
  assert.equal(config.mode, "mock");
  assert.equal(config.timeoutMs, 15000);
});

test("api mode requires a base URL", () => {
  assert.throws(() => getConfig({ CANNAAI_MODE: "api" }), /CANNAAI_BASE_URL/);
});

test("client sends bearer auth without leaking it into errors", async () => {
  let seenAuthorization = null;
  const fetchImpl = async (_url, init) => {
    seenAuthorization = init.headers.authorization;
    return new Response(JSON.stringify({ success: true, data: { plants: [], pagination: {} } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new CannaAIClient({
    baseUrl: "http://cannaai.local",
    apiToken: "super-secret",
    timeoutMs: 1000,
    fetchImpl,
  });
  await client.listPlants();
  assert.equal(seenAuthorization, "Bearer super-secret");
});

test("client maps 404 to CANNAAI_NOT_FOUND", async () => {
  const client = new CannaAIClient({
    baseUrl: "http://cannaai.local",
    timeoutMs: 1000,
    fetchImpl: async () => new Response("missing", { status: 404 }),
  });
  await assert.rejects(() => client.getPlant("missing"), (error) => {
    assert.ok(error instanceof CannaAIError);
    assert.equal(error.code, "CANNAAI_NOT_FOUND");
    return true;
  });
});
```

- [ ] **Step 2: Run tests and verify they fail before implementation**

Run:

```bash
node --test tests/client.test.mjs
```

Expected: FAIL because `src/config.js`, `src/client/errors.js`, and `src/client/cannaai-client.js` do not exist yet.

- [ ] **Step 3: Implement configuration parsing**

`getConfig` must:

- accept only `mock` or `api` for `CANNAAI_MODE`
- trim trailing `/` from `CANNAAI_BASE_URL`
- require an `http:` or `https:` URL in API mode
- parse `CANNAAI_REQUEST_TIMEOUT_MS` as an integer between 1000 and 120000, default 15000
- parse booleans strictly from the string `true`
- leave the API token nullable/empty without logging it

- [ ] **Step 4: Implement normalized errors**

Map HTTP/status/runtime failures to:

```text
400 -> CANNAAI_VALIDATION_ERROR
401 -> CANNAAI_UNAUTHORIZED
403 -> CANNAAI_FORBIDDEN
404 -> CANNAAI_NOT_FOUND
409 -> CANNAAI_CONFLICT
429 -> CANNAAI_RATE_LIMITED
5xx -> CANNAAI_INTERNAL_ERROR
timeout -> CANNAAI_TIMEOUT
network/fetch failure -> CANNAAI_UNAVAILABLE
```

Mark timeout, network, 429, and 5xx errors retryable for safe reads.

- [ ] **Step 5: Implement the HTTP client**

Requirements:

- construct URLs with `new URL(path, baseUrl + "/")`
- reject non-relative API paths that could turn the client into an arbitrary URL fetcher
- send `Accept: application/json`
- add `Authorization: Bearer ...` only when configured
- use `AbortController` for timeouts
- retry a retryable GET once with a small fixed delay
- never include the token or raw Authorization header in thrown messages
- parse JSON only when the response advertises JSON; otherwise include only a short sanitized status description

`listPlants()` calls `/api/plants?page=<page>&limit=<limit>`.

`getPlant(id)` calls `/api/plants/<encoded id>`.

`getEnvironment()` calls `/api/environment`.

`getStatus()` first calls `/api/health`; if that route is absent (404), it performs a lightweight `/api/plants?page=1&limit=1` compatibility probe and reports that the backend is reachable with `healthRoute: false`.

- [ ] **Step 6: Update `.env.example`**

Add:

```env
# CannaAI data source: mock | api
CANNAAI_MODE=mock
CANNAAI_BASE_URL=http://localhost:3000
CANNAAI_API_TOKEN=
CANNAAI_REQUEST_TIMEOUT_MS=15000
CANNAAI_ENABLE_WRITE_TOOLS=false
CANNAAI_ENABLE_AUTOMATION=false
```

- [ ] **Step 7: Run Stage 1 client tests**

Run:

```bash
node --test tests/client.test.mjs
node --check src/config.js
node --check src/client/errors.js
node --check src/client/cannaai-client.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .env.example src/config.js src/client/errors.js src/client/cannaai-client.js tests/client.test.mjs
git commit -m "feat: add CannaAI backend client foundation"
```

---

### Task 2: Normalize real CannaAI plant and environment data

**Files:**
- Create: `src/client/normalize.js`
- Create: `src/client/capabilities.js`
- Test: `tests/normalize.test.mjs`

**Interfaces:**
- Produces: `normalizePlant(raw)`.
- Produces: `normalizePlantsResponse(payload)` returning `{ plants, pagination }`.
- Produces: `normalizeEnvironmentResponse(payload, { plantId } = {})` returning the existing plugin environment shape.
- Produces: `detectCapabilities({ status, probes })` returning the normalized capability object from the design spec.

- [ ] **Step 1: Write failing normalization tests**

Use fixtures matching the real CannaAI endpoints:

```js
const rawPlant = {
  id: "plant-1",
  name: "Purple Sunshine #1",
  strainId: "strain-1",
  stage: "flowering",
  age: 54,
  plantedDate: "2026-06-20T00:00:00.000Z",
  locationId: "room-1",
  notes: "keeper",
  isActive: true,
  strain: { name: "Purple Sunshine", type: "hybrid" },
};
```

Assert `normalizePlant(rawPlant)` returns stable fields including:

```js
{
  id: "plant-1",
  name: "Purple Sunshine #1",
  strain: "Purple Sunshine",
  stage: "flowering",
  day: 54,
  location: "room-1",
  roomId: "room-1",
  plantedAt: "2026-06-20T00:00:00.000Z",
  notes: "keeper",
}
```

Test environment normalization with readings whose sensor identity is available through `data.type`, `data.sensorType`, `data.name`, or `sensorId`. Recognize common aliases for temperature, humidity, VPD, CO2, soil moisture, EC, pH, and PPFD. Convert Celsius readings to Fahrenheit only when the reading explicitly identifies Celsius.

- [ ] **Step 2: Run normalization tests and verify failure**

```bash
node --test tests/normalize.test.mjs
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement plant normalization**

Rules:

- `strain` prefers `raw.strain.name`, then string `raw.strain`, then `raw.strainName`, then `"Unknown"`.
- `day` prefers numeric `raw.age`, then numeric `raw.day`, else null.
- `roomId` prefers `raw.roomId`, then `raw.locationId`, else null.
- `location` prefers `raw.location`, then `raw.room.name`, then `roomId`, else `"Unassigned"`.
- Preserve `cameraId`, `medium`, `expectedHarvestAt`, `healthStatus`, and `notes` when present.
- Never synthesize a health diagnosis from missing backend data.

- [ ] **Step 4: Implement environment normalization**

The current plugin schema remains:

```js
{
  temperatureF,
  humidityPct,
  vpdKpa,
  soilMoisturePct,
  ec,
  ph,
  ppfd,
  co2Ppm,
  updatedAt,
}
```

Stage 1 may return null fields when the generic `/api/environment` endpoint lacks enough sensor metadata to identify the metric. It must not guess based solely on numeric ranges.

- [ ] **Step 5: Implement capability detection**

Stage 1 capabilities are deterministic:

- `plants`: true when the plants probe succeeds
- `environment`: true when `/api/environment` succeeds
- `cameras`: true when camera HTTP mode is configured or backend status explicitly advertises camera support
- `imageAnalysis`: true when backend status advertises analysis support or `OPENAI_API_KEY` exists for the current fallback analyzer
- all later-stage capabilities default false until explicit probes are added

Return every boolean from the design's capability object so consumers do not need undefined checks.

- [ ] **Step 6: Run normalization tests**

```bash
node --test tests/normalize.test.mjs
node --check src/client/normalize.js
node --check src/client/capabilities.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/client/normalize.js src/client/capabilities.js tests/normalize.test.mjs
git commit -m "feat: normalize CannaAI backend data"
```

---

### Task 3: Switch the store to mock-or-API mode without breaking existing tools

**Files:**
- Modify: `src/store.js`
- Test: `tests/store.test.mjs`
- Modify: `test.mjs`

**Interfaces:**
- Existing exports remain: `listPlants()`, `getPlant(plantId)`, `getEnvironment(plantId)`, `getDashboardData(plantId)`.
- Add: `getBackendStatus()` and `getCapabilities()` for the MCP system tools.
- The store owns mode selection; MCP handlers do not read fixture JSON directly.

- [ ] **Step 1: Write failing store tests**

Test both modes.

Mock mode must preserve the current behavior exactly enough that existing fixture tests still pass.

API mode uses an injectable client factory for tests rather than making live network calls. Test that:

- `listPlants()` returns normalized backend plants
- `getPlant(id)` prefers the backend detail route and falls back to the normalized list result only if the detail route is unsupported (404)
- `getEnvironment(plantId)` returns normalized environment data and does not pretend generic room readings are plant-specific when the backend does not provide that association
- `getDashboardData` still returns `{ plant, environment }`

- [ ] **Step 2: Run store tests and verify failure**

```bash
node --test tests/store.test.mjs
```

Expected: FAIL until store refactor is implemented.

- [ ] **Step 3: Refactor `src/store.js`**

Keep fixture reading private as `mockListPlants`, `mockGetPlant`, and `mockGetEnvironment`.

In API mode:

- construct a configured `CannaAIClient`
- normalize `/api/plants` results
- normalize plant detail responses supporting common envelopes (`{success,data}`, `{data}`, or direct object)
- normalize `/api/environment`
- return `null` rather than fabricating data when a plant or environment association is unavailable

Expose a test-only dependency injection hook only if necessary; prefer a small exported `createStore({ config, client })` factory with the legacy top-level exports delegating to a default store instance.

- [ ] **Step 4: Consolidate old root tests**

Move fixture/store coverage into `tests/store.test.mjs` and keep `test.mjs` only if needed for backward compatibility with the existing `node --test` script. Do not duplicate the same assertions in two files.

- [ ] **Step 5: Run store and existing tests**

```bash
node --test tests/store.test.mjs test.mjs
node --check src/store.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store.js tests/store.test.mjs test.mjs
git commit -m "feat: connect store to real CannaAI backend"
```

---

### Task 4: Add MCP backend status and capability tools

**Files:**
- Modify: `server.js`
- Test: `tests/mcp-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Add MCP tool `get_cannaai_status`.
- Add MCP tool `get_cannaai_capabilities`.
- Both are read-only and return concise `structuredContent`.
- Existing tool contracts remain intact.

- [ ] **Step 1: Write failing contract tests**

Extract or expose a small server-construction boundary that can be inspected without binding a TCP port. Verify the server registers both new tool names and that their annotations are:

```js
{
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
}
```

`openWorldHint` is true because API mode can contact the configured CannaAI backend.

- [ ] **Step 2: Run contract test and verify failure**

```bash
node --test tests/mcp-contract.test.mjs
```

Expected: FAIL before new tools exist.

- [ ] **Step 3: Add `get_cannaai_status`**

Output shape:

```js
{
  mode: "mock" | "api",
  reachable: boolean,
  backend: {
    baseUrlConfigured: boolean,
    healthRoute: boolean | null,
    version: string | null,
  },
  pluginVersion: string,
}
```

Do not return the actual private base URL or token.

- [ ] **Step 4: Add `get_cannaai_capabilities`**

Return the full normalized boolean capability object. Tool description must begin with `Use this when...` and tell the model to consult this tool before assuming optional CannaAI features are available.

- [ ] **Step 5: Update root health response**

The `/` JSON response should include `cannaaiMode` and a safe `backendConfigured` boolean, but must not expose a private `CANNAAI_BASE_URL`.

- [ ] **Step 6: Update package scripts**

Make `npm run check` syntax-check every Stage 1 module and run all Node tests:

```json
"check": "node --check server.js && node --check src/config.js && node --check src/client/errors.js && node --check src/client/cannaai-client.js && node --check src/client/normalize.js && node --check src/client/capabilities.js && node --check src/store.js && node --check src/adapters/camera.js && node --check src/lib/vision.js && node --test"
```

- [ ] **Step 7: Run all available validation**

```bash
npm run check
```

Expected: PASS with zero test failures in a normal dependency-installed checkout.

If package installation is unavailable in the execution environment, run all dependency-free Node tests and `node --check` on all Stage 1 files, then record that full MCP runtime validation remains CI/local-machine work.

- [ ] **Step 8: Commit**

```bash
git add server.js tests/mcp-contract.test.mjs package.json
git commit -m "feat: expose CannaAI backend capabilities to ChatGPT"
```

---

### Task 5: Documentation and Stage 1 acceptance check

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md` only if current guidance is insufficient for backend token/base URL handling

**Interfaces:**
- Documentation distinguishes `mock` mode from real `api` mode.
- Real backend setup uses `CANNAAI_BASE_URL` and optional `CANNAAI_API_TOKEN`.

- [ ] **Step 1: Update README architecture and setup**

Document:

```env
CANNAAI_MODE=api
CANNAAI_BASE_URL=http://localhost:3000
CANNAAI_API_TOKEN=
```

Explain that Stage 1 uses CannaAI's real `/api/plants` and `/api/environment` endpoints while preserving mock fixtures for safe public-repo development.

Document the new prompts/tools:

```text
Check whether my CannaAI backend is reachable.
What CannaAI capabilities are available right now?
Show me my real CannaAI plants.
```

- [ ] **Step 2: Document privacy behavior**

State explicitly that status tools return only whether a backend URL is configured/reachable; they do not expose the configured private URL or API token.

- [ ] **Step 3: Run final self-review**

Check:

- mock mode still works without CannaAI
- API mode requires a valid base URL
- existing tool names are unchanged
- no secret values are committed
- no arbitrary URL-fetch capability was introduced
- backend failures normalize to stable codes
- the plugin reports unsupported optional features instead of pretending parity exists

- [ ] **Step 4: Run final validation**

```bash
npm run check
```

Expected: PASS in a dependency-installed checkout. Also manually inspect the committed `.env.example` and README for secrets/private hostnames.

- [ ] **Step 5: Commit**

```bash
git add README.md SECURITY.md
git commit -m "docs: document real CannaAI backend mode"
```
