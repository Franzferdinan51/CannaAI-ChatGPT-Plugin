# CannaAI ChatGPT Feature Parity Design

**Date:** 2026-08-13  
**Repository:** `Franzferdinan51/CannaAI-ChatGPT-Plugin`  
**Reference application:** `Franzferdinan51/CannaAI`

## 1. Goal

Bring `CannaAI-ChatGPT-Plugin` as close as practical to feature parity with the main `CannaAI` application by making the plugin a ChatGPT-native MCP facade over the real CannaAI backend rather than duplicating CannaAI business logic.

The plugin should let ChatGPT inspect, analyze, summarize, compare, and visualize the same grow data that CannaAI exposes, while handling consequential automation through explicit preview-and-confirm flows.

## 2. Design principles

1. **One source of truth.** CannaAI remains authoritative for plants, rooms, sensors, analyses, alerts, inventory, harvests, and automation state.
2. **MCP is the ChatGPT boundary.** The plugin translates ChatGPT tool calls into typed CannaAI API requests and converts responses into compact structured content suitable for language-model reasoning and widgets.
3. **No backend duplication.** The plugin does not reimplement CannaAI persistence, cultivation logic, analytics calculations, notification logic, or automation engines.
4. **Read first, act second.** Read-only tools are the default surface. Physical or destructive actions use a separate preview-and-execute pattern and are disabled by default.
5. **Stable tool contracts.** ChatGPT-facing tool names and output schemas remain stable even if CannaAI internal implementation changes.
6. **Graceful capability detection.** The plugin can connect to different CannaAI deployments and only advertises or enables features that the connected backend supports.
7. **Public-repo safety.** No committed credentials, private grow URLs, camera tokens, signed URLs, real grow exports, or user-specific identifiers.

## 3. Architecture

```text
ChatGPT
   |
   | MCP /mcp
   v
CannaAI-ChatGPT-Plugin
   |
   |-- MCP tool registry
   |-- ChatGPT UI resources/widgets
   |-- schema normalization
   |-- capability discovery
   |-- authorization and action safeguards
   `-- CannaAIClient
          |
          | HTTP/HTTPS API
          v
       CannaAI
          |
          |-- PostgreSQL / Prisma
          |-- sensors / MQTT / controllers
          |-- cameras
          |-- AI providers
          |-- alerts / notifications
          `-- automation
```

The existing local JSON fixtures remain available only as `mock` mode for development and tests. Production parity mode uses `CANNAAI_BASE_URL` and the `CannaAIClient` adapter.

## 4. Capability groups

### 4.1 System and capability discovery

ChatGPT must be able to determine which CannaAI capabilities are currently reachable before calling specialized tools.

Planned tools:

- `get_cannaai_status`
- `get_cannaai_capabilities`

The normalized capability object should include booleans for:

- plants
- rooms
- environment
- environmentHistory
- cameras
- imageAnalysis
- trichomeAnalysis
- analysisHistory
- alerts
- canopy
- analytics
- advisors
- aiInsights
- inventory
- harvests
- automationRead
- automationWrite

The capability layer prevents a ChatGPT deployment from assuming every historical CannaAI route exists on every installation.

### 4.2 Plants and rooms

The existing `list_plants` and `get_plant` tools remain stable but switch to the real backend when configured.

Add:

- `list_rooms`
- `get_room`
- `list_room_plants`

Normalized plant fields should include when available:

- id
- name
- strain
- stage
- day
- roomId
- location
- medium
- plantedAt
- expectedHarvestAt
- cameraId
- healthStatus
- notes

The plugin should preserve unknown backend fields internally but expose a predictable normalized shape to ChatGPT.

### 4.3 Environment and history

Keep `get_environment`, then add historical and room-level reads:

- `get_room_environment`
- `get_environment_history`
- `compare_environment`

Normalized metrics may include:

- temperatureF
- humidityPct
- vpdKpa
- co2Ppm
- soilMoisturePct
- ec
- ph
- ppfd
- dewPointF
- updatedAt

All temperature output exposed to ChatGPT should use Fahrenheit as the primary unit. If the backend also returns Celsius it may be retained as secondary metadata, but the human-readable summary should default to Fahrenheit.

Historical requests accept a bounded time range and optional aggregation interval. The plugin should avoid returning unbounded raw sensor streams to ChatGPT.

### 4.4 Alerts and notifications

Add read-oriented alert tools:

- `list_alerts`
- `get_alert`
- `summarize_active_alerts`

Filters should support:

- status
- severity
- plantId
- roomId
- type
- since

Alert acknowledgement or dismissal is a write operation and belongs behind the action safeguard described in section 7.

### 4.5 Image analysis

The current `get_latest_snapshot` and `analyze_plant_snapshot` tools remain, but parity mode should prefer CannaAI's own analysis endpoint so provider configuration, prompt logic, history persistence, and model selection remain centralized.

Planned tools:

- `get_latest_snapshot`
- `analyze_plant_snapshot`
- `analyze_plant_image`
- `get_plant_analyses`
- `get_analysis`

The plugin must distinguish:

- direct visible observations
- CannaAI model conclusions
- confidence estimates
- environmental context
- recommended actions

The plugin should not silently present low-confidence diagnoses as facts.

### 4.6 Trichome and harvest-readiness analysis

Add:

- `analyze_trichomes`
- `get_trichome_capabilities`
- `get_harvest_readiness`

Normalized trichome output should include when available:

- clearPct
- cloudyPct
- amberPct
- maturityStage
- confidence
- harvestReady
- estimatedHarvestWindow
- imageQuality
- recommendations

The tool description must tell ChatGPT that trichome analysis requires appropriate macro or microscope imagery and that image quality materially affects confidence.

### 4.7 Canopy and plant-development data

Expose CannaAI canopy-related information through:

- `get_canopy_status`
- `get_canopy_history`

Fields are normalized only when supported by the backend, for example canopy coverage, height, density, training notes, and time-series changes.

### 4.8 Analysis history and analytics

Add:

- `get_analysis_history`
- `get_plant_health_analytics`
- `get_grow_analytics`
- `compare_plants`

These should support bounded date/time ranges and optional plant or room filters.

ChatGPT should receive compact summaries plus structured data rather than raw database records.

### 4.9 Advisors and AI insights

Where the connected CannaAI backend exposes advisor or insight endpoints, add:

- `list_advisors`
- `ask_cannaai_advisor`
- `get_ai_insights`

These tools must clearly label which conclusions came from CannaAI's advisor system versus ChatGPT's own synthesis.

The plugin should avoid creating a second independent cultivation-agent framework. It should call CannaAI's advisor layer when the user asks specifically for CannaAI-generated advice.

### 4.10 Inventory and harvest data

Where supported, expose read tools:

- `get_inventory_summary`
- `list_inventory_items`
- `list_harvests`
- `get_harvest`
- `get_harvest_metrics`

This includes quantities, yield, dates, strain association, costs, and other business metrics already calculated by CannaAI.

The plugin must not invent financial calculations when CannaAI already provides authoritative values.

## 5. CannaAI client boundary

Create a dedicated API adapter rather than making network calls directly from tool handlers.

Suggested file layout:

```text
src/
  client/
    cannaai-client.js
    errors.js
    capabilities.js
    schemas.js
  tools/
    system.js
    plants.js
    environment.js
    alerts.js
    analysis.js
    trichomes.js
    canopy.js
    analytics.js
    advisors.js
    inventory.js
    automation.js
  adapters/
    camera.js
    mock-store.js
  lib/
    vision.js
    normalize.js
    result.js
```

`CannaAIClient` owns:

- base URL handling
- authentication headers
- request timeout
- JSON parsing
- status-code normalization
- capability discovery
- retry policy for safe idempotent reads
- route fallback when CannaAI supports more than one historical endpoint shape

Tool handlers own:

- MCP descriptions
- Zod input and output schemas
- model-friendly summaries
- annotations
- ChatGPT widget metadata

## 6. Configuration

New environment variables:

```env
CANNAAI_MODE=mock
CANNAAI_BASE_URL=http://localhost:3000
CANNAAI_API_TOKEN=
CANNAAI_REQUEST_TIMEOUT_MS=15000
CANNAAI_ENABLE_WRITE_TOOLS=false
CANNAAI_ENABLE_AUTOMATION=false
CANNAAI_ALLOWED_ORIGINS=
```

Rules:

- `mock` mode remains the safe default for a freshly cloned public repository.
- `api` mode requires `CANNAAI_BASE_URL`.
- credentials are read only from environment variables.
- secrets never appear in tool outputs, logs, widget HTML, or structured content.
- write tools remain disabled unless `CANNAAI_ENABLE_WRITE_TOOLS=true`.
- physical automation remains disabled unless both `CANNAAI_ENABLE_WRITE_TOOLS=true` and `CANNAAI_ENABLE_AUTOMATION=true`.

## 7. Consequential action safeguard

Physical grow actions and destructive data changes require a two-step protocol.

### 7.1 Preview

Examples:

- `preview_automation_action`
- `preview_alert_action`

A preview returns:

```json
{
  "actionId": "opaque-short-lived-id",
  "action": "set_light_state",
  "target": {
    "roomId": "room-1"
  },
  "requestedChange": {
    "state": "off"
  },
  "currentState": {
    "state": "on"
  },
  "expiresAt": "ISO-8601 timestamp",
  "requiresConfirmation": true
}
```

The preview call performs no mutation.

### 7.2 Execute

`execute_automation_action` requires the exact unexpired `actionId` returned by the preview plus `confirm: true`.

Execution must fail if:

- write tools are disabled
- automation is disabled
- the preview expired
- target state materially changed since preview
- the action differs from the preview
- required backend authorization is unavailable

MCP annotations for execution tools must set `readOnlyHint: false` and accurately reflect destructive/open-world behavior.

The plugin must not expose a generic unrestricted HTTP request or arbitrary command-execution tool.

## 8. ChatGPT widgets

The existing plant dashboard remains, but the UI surface grows into focused views rather than recreating the complete CannaAI web application inside ChatGPT.

### 8.1 Grow overview widget

Shows:

- active rooms
- plant count
- active alerts
- high-level environment health
- latest analyses

### 8.2 Plant detail widget

Shows:

- plant metadata
- latest snapshot
- current environment
- recent health analysis
- harvest-readiness summary

### 8.3 Environment trends widget

Shows a bounded time-series view for temperature, humidity, VPD, CO2, soil moisture, EC, pH, and PPFD when available.

### 8.4 Alerts widget

Shows current alerts grouped by severity and target.

### 8.5 Analysis result widget

Shows diagnosis, confidence, visible observations, likely causes, recommendations, trichome distribution, and harvest timing when applicable.

Widgets are intentionally read-oriented. Consequential controls should be invoked through explicit MCP actions rather than hidden buttons that bypass the confirmation protocol.

## 9. Error handling

All backend failures should normalize into a small error vocabulary:

- `CANNAAI_UNAVAILABLE`
- `CANNAAI_TIMEOUT`
- `CANNAAI_UNAUTHORIZED`
- `CANNAAI_FORBIDDEN`
- `CANNAAI_NOT_FOUND`
- `CANNAAI_UNSUPPORTED`
- `CANNAAI_VALIDATION_ERROR`
- `CANNAAI_RATE_LIMITED`
- `CANNAAI_CONFLICT`
- `CANNAAI_INTERNAL_ERROR`

Tool responses should provide a concise human-readable explanation without exposing stack traces, credentials, raw headers, or private URLs.

Read tools may retry transient connection failures once when safe. Write tools never auto-retry after an ambiguous network failure.

## 10. Authentication and deployment security

The plugin is expected to sit between ChatGPT and a user-controlled CannaAI instance.

Production requirements:

1. HTTPS for the public MCP endpoint.
2. Authentication between ChatGPT/plugin deployment and CannaAI.
3. User-to-grow authorization when the deployment serves more than one user.
4. Explicit CORS policy instead of wildcard production CORS.
5. Exact widget CSP domains.
6. Signed, short-lived camera snapshot URLs.
7. Server-side rate limits for expensive analysis and snapshot tools.
8. No permanent camera credentials in widget-visible data.
9. Audit logging for consequential actions without logging secret values.

The plugin should fail closed when authorization state cannot be established.

## 11. Testing strategy

### 11.1 Unit tests

Cover:

- response normalization
- capability parsing
- client URL construction
- auth header behavior
- timeout behavior
- normalized errors
- schema validation
- preview/execute action validation

### 11.2 Mock-backend integration tests

Run the MCP server against a deterministic mock CannaAI HTTP server and verify:

- plants
- rooms
- environment
- alerts
- analysis
- trichomes
- analytics
- inventory
- unsupported capability behavior

### 11.3 MCP contract tests

Verify tool registration, annotations, input schemas, output schemas, and structured content.

Existing tool names must keep backward-compatible contracts where practical:

- `list_plants`
- `get_plant`
- `get_environment`
- `get_latest_snapshot`
- `analyze_plant_snapshot`
- `render_plant_dashboard`

### 11.4 Action safety tests

Verify that:

- mutation tools are absent or blocked by default
- preview never mutates state
- execute requires an unexpired matching action ID
- execute rejects stale target state
- ambiguous write failures are not retried

### 11.5 Widget tests

Verify widget HTML/JS can render missing optional fields, unsupported capabilities, loading states, and backend errors without crashing.

## 12. Compatibility and versioning

The plugin should expose its own semantic version and connected-backend metadata from `get_cannaai_status`.

Backend feature detection takes precedence over hardcoded CannaAI version comparisons. Version checks may be used for diagnostics but must not be the only mechanism deciding whether a tool is usable.

Existing plugin users in mock mode should continue to work after the parity upgrade.

## 13. Staged implementation

The parity project is intentionally split into independently testable stages.

### Stage 1 — Real backend foundation

- `CannaAIClient`
- configuration loader
- capability discovery
- normalized errors
- switch existing plant/environment tools from fixture-only to mock-or-API mode
- tests

This stage must leave all existing tools functional.

### Stage 2 — Read-only cultivation parity

- rooms
- environment history
- alerts
- analysis history
- CannaAI-backed photo analysis
- trichome analysis
- canopy
- analytics
- tests

### Stage 3 — Business and advisor parity

- advisors
- AI insights
- inventory
- harvest records
- yield/business metrics
- tests

### Stage 4 — ChatGPT widgets

- grow overview
- richer plant detail
- environment trends
- alerts
- analysis/trichome result views
- widget regression tests

### Stage 5 — Guarded automation parity

- automation status reads
- preview action protocol
- execute action protocol
- feature flags
- audit-safe logging
- destructive-action tests

Each stage must be shippable without requiring unfinished later stages.

## 14. Non-goals

The parity project does not:

- copy the full Next.js CannaAI frontend into the plugin
- copy CannaAI's Prisma database into the plugin
- create a second automation engine
- create a second notification engine
- create a second AI-provider configuration system
- expose unrestricted shell, ADB, SQL, arbitrary URL fetch, or generic command execution
- guarantee parity for UI-only functionality that has no backend/API representation

When a useful CannaAI feature has no callable backend endpoint, the preferred fix is to add a narrow API endpoint to CannaAI and then expose it through MCP, rather than duplicating the feature in the plugin.

## 15. Acceptance criteria

The parity effort is successful when:

1. A configured plugin can connect to a real CannaAI instance without editing source code.
2. The original six plugin capabilities continue to work.
3. ChatGPT can inspect plants, rooms, current environment, historical environment, alerts, analyses, trichomes, canopy, analytics, inventory, and harvest information whenever the connected backend supports them.
4. ChatGPT can render focused grow, plant, trend, alert, and analysis views.
5. CannaAI remains the authoritative data and automation backend.
6. Unsupported CannaAI capabilities fail clearly rather than returning fabricated data.
7. Physical or destructive actions are disabled by default and require preview plus explicit confirmation when enabled.
8. The public repository contains no real credentials or private grow data.
9. Automated tests cover client behavior, MCP contracts, unsupported capabilities, and action safeguards.
10. The README documents mock mode, real CannaAI mode, configuration, security expectations, and the supported parity matrix.
