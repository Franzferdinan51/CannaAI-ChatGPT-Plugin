# CannaAI ChatGPT Stage 3 Advisor, Insights, and Inventory Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the verified CannaAI advisor, predictive-insights, and inventory surfaces to ChatGPT without inventing harvest/business APIs that do not exist in the current CannaAI backend.

**Architecture:** Extend the existing client/store/capability boundary with three verified backend areas: `/api/advisors`, `/api/ai-insights`, and read-only `/api/inventory`. Advisor POST is a non-destructive compute call and remains separate from read tools. Inventory is clearly labeled backend-reported because current CannaAI main uses an in-memory/mock inventory dataset. Harvest capability remains false until a real read API exists.

**Tech Stack:** Node.js 20+ ESM, native fetch, Node test runner, Zod, MCP SDK/ext-apps, GitHub Actions CI.

## Global Constraints

- Preserve all Stage 1 and Stage 2 tools and contracts.
- Do not add a harvest tool or mark `harvests=true` without a verified CannaAI read endpoint.
- Do not claim AI insights are room-filtered: current CannaAI parses `room` but does not apply it to its database query.
- Bound AI-insight lookback to 1–168 hours.
- Advisor tasks max 12000 characters; optional context max 20000 characters, matching CannaAI.
- Advisor execution is non-destructive but may invoke configured AI providers; tool copy must say it runs the CannaAI advisor workflow.
- Inventory tools are read-only. Current CannaAI inventory is in-memory/mock-backed, so responses/tool copy must identify data as backend-reported and potentially demo data.
- No inventory POST/PUT/DELETE is exposed in Stage 3.

---

### Task 1: Extend CannaAIClient

**Files:**
- Modify: `src/client/cannaai-client.js`
- Test: `tests/stage3-client.test.mjs`

**Interfaces:**
- `getAdvisorStatus()` -> `GET /api/advisors`
- `runAdvisor({ task, context, provider, model })` -> `POST /api/advisors`
- `getAiInsights({ hours })` -> `GET /api/ai-insights?hours=N`
- `getInventory()` -> `GET /api/inventory`

- [ ] Test exact paths, URL encoding, and 1–168 hour bounds.
- [ ] Test advisor POST sends JSON with `Content-Type: application/json` and does not retry because it is POST.
- [ ] Implement methods through existing `request()` so auth/timeouts/error normalization stay centralized.

---

### Task 2: Normalize Stage 3 responses

**Files:**
- Create: `src/client/normalize-stage3.js`
- Test: `tests/stage3-normalize.test.mjs`

**Interfaces:**
- `normalizeAdvisorStatus(payload)` -> `{ workflow, providers[] }`
- `normalizeAdvisorResult(payload)` -> compact provider/model/planner/skeptic/synthesis metadata while preserving a bounded raw result object where useful.
- `normalizeAiInsights(payload)` -> `{ insights[], summary, coPilotResponse, latestReadings }`
- `normalizeInventory(payload)` -> `{ items[], statistics, lowStockItems[], source: "cannaai-backend" }`

- [ ] Preserve CannaAI severity/type/recommended-action semantics for insights.
- [ ] Keep missing numeric fields null rather than inventing values.
- [ ] Normalize inventory item IDs to strings and costs/quantities to numbers when valid.

---

### Task 3: Extend store and capability discovery

**Files:**
- Modify: `src/store.js`
- Modify: `src/client/capabilities.js`
- Test: `tests/stage3-store.test.mjs`

**Interfaces:**
- `getAdvisorStatus()`
- `askCannaAiAdvisor(options)`
- `getAiInsights({ hours })`
- `getInventorySummary()`
- `listInventoryItems({ category, lowStockOnly })`

Capability probes:
- `advisors=true` only when GET `/api/advisors` succeeds.
- `aiInsights=true` only when GET `/api/ai-insights?hours=1` succeeds.
- `inventory=true` only when GET `/api/inventory` succeeds.
- `harvests=false` remains unchanged.

- [ ] Mock mode returns disabled/empty Stage 3 remote capabilities.
- [ ] Test independent fail-closed probes.
- [ ] Test inventory filtering is local over the backend response and does not mutate it.

---

### Task 4: Register MCP tools

**Files:**
- Create: `src/tools/stage3.js`
- Modify: `server.js`
- Test: `tests/stage3-mcp-contract.test.mjs`

**Tools:**
- `get_advisor_status` — read-only provider/workflow status.
- `ask_cannaai_advisor` — non-destructive compute call to CannaAI's planner → skeptic → synthesizer workflow.
- `get_ai_insights` — predictive insight read, hours only; do not expose misleading room filter.
- `get_inventory_summary` — backend-reported inventory statistics and low-stock items.
- `list_inventory_items` — optional category/low-stock filters over the read response.

Annotations:
- Reads: `{ readOnlyHint: true, destructiveHint: false, openWorldHint: true }`.
- Advisor compute: `{ readOnlyHint: true, destructiveHint: false, openWorldHint: true }` plus invocation metadata making the provider call visible.

- [ ] Update plugin version to `0.4.0`.
- [ ] Keep all descriptions explicit about CannaAI as the source.
- [ ] Inventory descriptions warn that current CannaAI main uses an in-memory/mock inventory implementation.

---

### Task 5: HTTP integration, docs, and CI

**Files:**
- Create: `tests/stage3-http-integration.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` version assertion

- [ ] Add CannaAI-shaped local HTTP routes for advisors GET/POST, ai-insights GET, and inventory GET.
- [ ] Verify advisor POST body and normalized response end-to-end.
- [ ] Verify capability flags `advisors`, `aiInsights`, and `inventory` become true while `harvests` remains false.
- [ ] Extend syntax checks for Stage 3 modules.
- [ ] Run local `npm run check` with zero failures.
- [ ] Push to `main` and require GitHub Actions Node 20 and Node 22 jobs, including server-startup smoke test, to pass before Stage 3 is considered complete.
