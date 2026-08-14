# CannaAI ChatGPT Stage 2 Read-Only Cultivation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the real CannaAI read-only cultivation surface through stable ChatGPT MCP tools: rooms, room plants, sensor history/comparison, alerts, plant analyses, health analytics, canopy status, and trichome capability discovery.

**Architecture:** Extend the Stage 1 `CannaAIClient` with narrow endpoint methods, normalize all CannaAI response shapes before they reach MCP, and keep higher-level summaries/comparisons inside the plugin store. Capability discovery probes the actual routes and fails closed. Stage 2 adds no backend mutations and no physical grow controls.

**Tech Stack:** Node.js 20+ ESM, native fetch, Node test runner, Zod, MCP SDK/ext-apps.

## Global Constraints

- Keep all Stage 1 tools backward-compatible.
- Every Stage 2 tool is read-only; no PUT/POST/DELETE mutation is exposed except future image-analysis compute tools explicitly covered by later work.
- CannaAI remains the source of truth; the plugin normalizes and summarizes rather than persisting duplicate records.
- Bounded reads only: sensor history max 500 records, analysis lists max backend-defined limits.
- Fahrenheit remains the primary temperature unit.
- Do not represent CannaAI stub/demo values as live measurements without labeling their source.
- Unsupported/unreachable capabilities return `false` and tools return normalized unsupported/unavailable errors rather than fabricated data.

---

### Task 1: Extend CannaAIClient read routes

**Files:**
- Modify: `src/client/cannaai-client.js`
- Test: `tests/stage2-client.test.mjs`

**Interfaces:**
- `listRooms()` -> `GET /api/rooms`
- `getRoom(roomId)` -> `GET /api/rooms/{id}`
- `getSensorHistory({ roomId, sensorId, limit })` -> `GET /api/sensors?...`
- `listAlerts()` -> `GET /api/alerts`
- `getAlert(alertId)` -> `GET /api/alerts/{id}`
- `getPlantAnalyses(plantId)` -> `GET /api/plants/{id}/analyses`
- `getAnalysisHistory()` -> `GET /api/history`
- `getPlantHealthAnalytics({ timeframe, plantId })` -> `GET /api/analytics/plant-health`
- `getCanopyStatus()` -> `GET /api/canopy`
- `getTrichomeCapabilities()` -> `GET /api/trichome-analysis`

- [ ] Add tests asserting exact encoded URL paths/query parameters and bounds: sensor limit 1-500; analytics timeframe only `7d|30d|90d`.
- [ ] Implement methods using existing `request()` so retries/error normalization/auth remain centralized.
- [ ] Run `node --test tests/stage2-client.test.mjs` and Stage 1 tests.

---

### Task 2: Add Stage 2 normalizers and comparisons

**Files:**
- Create: `src/client/normalize-stage2.js`
- Test: `tests/stage2-normalize.test.mjs`

**Interfaces:**
- `normalizeRoom(raw)` -> `{ id, name, temperatureF, humidityPct, co2Ppm, active, createdAt, updatedAt }`
- `normalizeAlert(raw)` -> `{ id, sensorId, type, severity, message, acknowledged, createdAt, updatedAt }`
- `normalizeSensorHistory(payload)` -> chronological array with `{ timestamp, temperatureF, humidityPct, vpdKpa, co2Ppm, light, source, roomId, sensorId }`
- `normalizeAnalysis(raw)` -> stable analysis identity/diagnosis/confidence/health score/recommendations/provider/timestamp while preserving a compact `result` object when present.
- `normalizePlantHealthAnalytics(payload)` -> stable summary/trends/top issues/records.
- `normalizeCanopyStatus(payload)` -> `{ coveragePct, height, width, density, source: "cannaai" }`.
- `normalizeTrichomeCapabilities(payload)` -> device/options/performance capability object.
- `compareEnvironmentSeries(seriesA, seriesB)` -> metric averages/deltas for values actually present; no invented values.
- `summarizeAlerts(alerts)` -> total/unacknowledged counts, severity distribution, newest critical/high items.

- [ ] Add deterministic tests for every normalizer, including Stage 2 sensor payloads where temperature is already Fahrenheit.
- [ ] Ensure empty/missing optional data produces null/empty fields instead of invented measurements.
- [ ] Run normalization tests and syntax checks.

---

### Task 3: Extend store and capability discovery

**Files:**
- Modify: `src/store.js`
- Modify: `src/client/capabilities.js`
- Test: `tests/stage2-store.test.mjs`

**Interfaces:**
- Add store methods: `listRooms`, `getRoom`, `listRoomPlants`, `getEnvironmentHistory`, `compareEnvironment`, `listAlerts`, `getAlert`, `summarizeActiveAlerts`, `getPlantAnalyses`, `getAnalysis`, `getAnalysisHistory`, `getPlantHealthAnalytics`, `comparePlants`, `getCanopyStatus`, `getTrichomeCapabilities`.
- Mock mode returns safe synthetic/empty results where no Stage 2 fixture exists and does not pretend those capabilities are backed by real CannaAI.
- API capability probes independently test `/api/rooms`, `/api/sensors`, `/api/alerts`, `/api/plants/{id}/analyses` when a plant exists, `/api/analytics/plant-health`, `/api/canopy`, and `/api/trichome-analysis`.

- [ ] Test room filtering via normalized `roomId`.
- [ ] Test environment comparisons from real sensor history shape.
- [ ] Test alert summaries and analysis lookup.
- [ ] Test `comparePlants` uses backend analytics when available and plant metadata otherwise, clearly leaving missing metrics null.
- [ ] Test capability flags fail closed independently.

---

### Task 4: Register ChatGPT MCP tools

**Files:**
- Modify: `server.js`
- Test: `tests/stage2-mcp-contract.test.mjs`

**Tools:**
- `list_rooms`
- `get_room`
- `list_room_plants`
- `get_environment_history`
- `compare_environment`
- `list_alerts`
- `get_alert`
- `summarize_active_alerts`
- `get_plant_analyses`
- `get_analysis`
- `get_analysis_history`
- `get_plant_health_analytics`
- `compare_plants`
- `get_canopy_status`
- `get_trichome_capabilities`

All annotations: `{ readOnlyHint: true, destructiveHint: false, openWorldHint: true }`.

- [ ] Add bounded machine-friendly schemas: history `limit` max 500; analytics timeframe enum; compare tools require distinct IDs.
- [ ] Tool descriptions begin with `Use this when...` and clarify source/limitations where needed.
- [ ] Update plugin version to `0.3.0`.
- [ ] Add contract tests for tool names and annotations.

---

### Task 5: Validation and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] Extend `npm run check` to syntax-check `normalize-stage2.js` and run the full test suite.
- [ ] Add a local HTTP integration test serving Stage 2 CannaAI-shaped routes and exercising rooms, sensors, alerts, analyses, analytics, canopy, and trichome capabilities end-to-end through the store.
- [ ] Run `npm run check`; require zero failures.
- [ ] Document all Stage 2 tools and explicitly note that current CannaAI `/api/canopy` returns a simple backend status payload and `/api/history` is in-memory in the current main app, so consumers should treat persistence according to the backend they actually run.
- [ ] Re-fetch committed files from GitHub `main` and verify they match the tested implementation before claiming completion.
