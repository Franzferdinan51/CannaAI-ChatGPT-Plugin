# CannaAI ChatGPT Stage 4 Rich Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing single-plant widget into a small set of polished, read-only ChatGPT views for grow overview, environment trends, alerts, and plant analysis while preserving the no-build plain-HTML Apps SDK architecture.

**Architecture:** Keep widgets as isolated HTML resources rendered by MCP App tools. Add a dedicated `src/tools/stage4-views.js` registry that aggregates existing store reads and binds each render tool to one UI resource. Widgets consume only their render tool's structured content, may send a follow-up message to ChatGPT, and do not perform hidden mutations. No React/Vite build chain is introduced.

**Tech Stack:** Node.js 20+ ESM, MCP ext-apps resources/tools, plain HTML/CSS/JS, inline SVG for trend charts, Node test runner, GitHub Actions.

## Global Constraints

- Preserve every existing MCP tool and the existing `render_plant_dashboard` tool.
- Widgets are read-only and never expose mutation controls.
- No external JavaScript/CDN dependency is required.
- Widget CSP remains minimal; images may use the existing resource domain allowance only where needed.
- Empty, unavailable, and unsupported data must render explicit states instead of blank/crashed views.
- Temperatures display in Fahrenheit.
- Charts use actual returned values only; missing metrics create gaps/empty states rather than interpolation or fabricated points.
- Widget follow-up actions ask ChatGPT for analysis; they do not bypass MCP safeguards.

---

### Task 1: Grow overview aggregation and widget

**Files:**
- Modify: `src/store.js`
- Create: `public/grow-overview-widget.html`
- Create: `src/tools/stage4-views.js`
- Test: `tests/stage4-store.test.mjs`
- Test: `tests/stage4-mcp-contract.test.mjs`

**Interfaces:**
- `getGrowOverview({ insightHours = 24 })` returns `{ rooms, plants, alertSummary, aiInsights, inventory }`.
- `render_grow_overview` takes optional `insightHours` 1–168 and renders `ui://cannaai/grow-overview-v1.html`.

- [ ] Aggregate independent reads with `Promise.allSettled` so one unavailable optional backend feature does not break the whole overview.
- [ ] Mark unavailable optional slices with `null` while preserving rooms/plants that succeeded.
- [ ] Widget shows plant/room counts, unacknowledged alert count, available room environment summary, latest predictive-insight summary, and low-stock inventory count.
- [ ] Widget includes a single “Ask ChatGPT about this grow” follow-up action.
- [ ] Add tests for partial-backend failure behavior and the App resource/tool registration.

---

### Task 2: Environment trends view

**Files:**
- Create: `public/environment-trends-widget.html`
- Modify: `src/tools/stage4-views.js`
- Test: `tests/stage4-widget-source.test.mjs`

**Interfaces:**
- `render_environment_trends({ roomId, limit = 100 })` returns `{ room, readings }` and renders `ui://cannaai/environment-trends-v1.html`.

- [ ] Bound limit to 1–500 through the MCP schema.
- [ ] Render summary cards for average temperature, RH, VPD, CO2, and light where present.
- [ ] Render lightweight inline SVG trend lines for temperature, RH, and VPD from chronological readings.
- [ ] Use metric-specific vertical scaling based only on the actual finite values for that metric.
- [ ] Show a useful empty-state message when no history is available.
- [ ] Add an “Ask ChatGPT about these trends” follow-up action.

---

### Task 3: Alerts view

**Files:**
- Create: `public/alerts-widget.html`
- Modify: `src/tools/stage4-views.js`
- Test: `tests/stage4-widget-source.test.mjs`

**Interfaces:**
- `render_alerts_dashboard({ severity?, acknowledged? })` returns `{ alerts, summary }` and renders `ui://cannaai/alerts-v1.html`.

- [ ] Group/render alerts by critical/high/warning/info/other severity without changing backend alert state.
- [ ] Display acknowledged state and timestamp.
- [ ] Show total and unacknowledged counts.
- [ ] Never render acknowledge/dismiss/delete controls in Stage 4.
- [ ] Add a follow-up action that asks ChatGPT to prioritize the visible alerts.

---

### Task 4: Plant analysis view and plant widget upgrade

**Files:**
- Create: `public/analysis-widget.html`
- Modify: `public/plant-widget.html`
- Modify: `src/tools/stage4-views.js`
- Test: `tests/stage4-widget-source.test.mjs`

**Interfaces:**
- `render_plant_analysis({ plantId, timeframe = '30d' })` returns `{ plant, analyses, analytics }` and renders `ui://cannaai/analysis-v1.html`.

- [ ] Analysis widget shows latest diagnosis, confidence, health score, recommendations, top issues, total analyses, and trend summary when available.
- [ ] Clearly label stored CannaAI analysis versus ChatGPT follow-up synthesis.
- [ ] Upgrade the existing plant widget metric grid to include CO2, PPFD, and dew point when present while preserving snapshot/analyze/follow-up behavior.
- [ ] Improve empty-state copy for plant-specific environment data that is unavailable because the backend only has room/grow-wide readings.

---

### Task 5: Version, docs, and verification

**Files:**
- Modify: `server.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

- [ ] Import/register Stage 4 view resources/tools from the server.
- [ ] Bump plugin version to `0.5.0`.
- [ ] Extend `npm run check` with syntax checks for `src/tools/stage4-views.js`.
- [ ] Add source-level widget tests verifying no mutation tool names/actions are embedded, the expected follow-up prompts exist, and SVG trend rendering code handles empty finite-value arrays.
- [ ] Update README with all render tools and the read-only view architecture.
- [ ] Run the full local suite with zero failures.
- [ ] Push to `main`; require GitHub Actions Node 20 and Node 22 checks plus the real server-startup smoke test to pass with root version `0.5.0` before Stage 4 is considered complete.
