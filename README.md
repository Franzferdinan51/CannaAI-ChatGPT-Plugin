# CannaAI ChatGPT Plant App

A ChatGPT/MCP app that exposes a real [CannaAI](https://github.com/Franzferdinan51/CannaAI) grow backend as safe, typed ChatGPT tools and lightweight in-chat views.

**Current plugin version: `0.3.0`**

The project supports two data modes:

- **`mock`** — self-contained public-repo development using synthetic fixtures.
- **`api`** — connects to a real CannaAI server and treats that backend as the source of truth.

The plugin is intentionally an MCP facade, not a second copy of CannaAI. Persistence, sensors, analyses, alerts, analytics, and future automation remain owned by CannaAI.

## What works now

### Stage 1 — Real backend foundation

- backend reachability/status checks
- capability discovery
- real or mock plant listing/details
- conservative plant-environment reads
- camera snapshot adapter
- optional server-side vision fallback
- existing plant dashboard widget
- normalized errors, timeouts, one retry for safe GET failures
- secret-safe status responses

### Stage 2 — Read-only cultivation parity

- grow rooms and room details
- plants filtered by room
- bounded sensor/environment history
- room-to-room environment comparison
- recent alerts and active-alert summaries
- per-plant analysis history and analysis lookup
- global legacy analysis history
- 7/30/90-day plant-health analytics
- multi-plant health comparison
- backend canopy status
- trichome-analysis capability discovery

Stage 2 is deliberately read-only. It does **not** expose alert mutation, room mutation, shell access, arbitrary HTTP, or physical grow controls.

## Architecture

```text
ChatGPT
  |
  | MCP /mcp
  v
CannaAI ChatGPT Plant App
  |-- MCP tool registries
  |-- ChatGPT plant widget
  |-- capability discovery
  |-- normalized schemas/errors
  |-- mock store
  `-- CannaAIClient
          |
          | HTTP/HTTPS /api/*
          v
        CannaAI
          |-- plants / rooms
          |-- environment / sensors
          |-- alerts
          |-- analyses / history
          |-- analytics / canopy
          `-- trichome capabilities
```

## Requirements

- Node.js 20+
- npm
- a running CannaAI instance for `CANNAAI_MODE=api`
- a public HTTPS URL for `/mcp` when connecting from ChatGPT
- optional `OPENAI_API_KEY` for the current local `analyze_plant_snapshot` fallback

## Install

```bash
npm install
cp .env.example .env
node --env-file=.env server.js
```

Development:

```bash
node --watch --env-file=.env server.js
```

Local MCP endpoint:

```text
http://localhost:8787/mcp
```

## Configuration

### Mock mode

```env
CANNAAI_MODE=mock
CAMERA_MODE=mock
```

### Real CannaAI mode

```env
CANNAAI_MODE=api
CANNAAI_BASE_URL=http://localhost:3000
CANNAAI_API_TOKEN=
CANNAAI_REQUEST_TIMEOUT_MS=15000
```

`CANNAAI_API_TOKEN` is optional because some local CannaAI deployments do not require a bearer token. If yours does, keep it only in environment configuration.

Write/automation flags are reserved for the later guarded-automation stage and stay off by default:

```env
CANNAAI_ENABLE_WRITE_TOOLS=false
CANNAAI_ENABLE_AUTOMATION=false
```

## CannaAI routes used by `0.3.0`

The plugin currently integrates with these real read routes when available:

```text
GET /api/plants
GET /api/plants/{id}
GET /api/environment
GET /api/rooms
GET /api/rooms/{id}
GET /api/sensors
GET /api/alerts
GET /api/plants/{id}/analyses
GET /api/history
GET /api/analytics/plant-health
GET /api/canopy
GET /api/trichome-analysis
```

The client also probes `GET /api/health`. Current CannaAI builds may not expose it; a 404 falls back to a lightweight plant-list reachability probe.

### Important backend caveats

**Alert detail:** current CannaAI exposes PUT/DELETE under `/api/alerts/{id}` but no GET. The ChatGPT `get_alert` tool therefore resolves the requested alert from the real read-only `/api/alerts` response instead of inventing a detail route.

**Global history:** the current CannaAI `/api/history` implementation stores its legacy global history in module memory. Persistence can therefore depend on the particular backend build and process lifetime. Per-plant analyses under `/api/plants/{id}/analyses` are the preferred plant-specific history source.

**Canopy:** the current CannaAI `/api/canopy` route returns a simple backend payload. The plugin labels it as CannaAI-reported data and does not imply that it came from a live vision measurement unless the backend actually provides one.

**Plant environment:** the generic `/api/environment` route can be grow-wide. `get_environment` will not assign those readings to a specific plant unless the backend explicitly provides the association. Use Stage 2 sensor-history tools for room/grow-wide data.

## MCP tool surface

### System

- `get_cannaai_status` — mock/API mode and safe reachability status
- `get_cannaai_capabilities` — complete boolean feature map; unsupported features fail closed

### Plants and current environment

- `list_plants`
- `get_plant`
- `get_environment`
- `get_latest_snapshot`
- `analyze_plant_snapshot`
- `render_plant_dashboard`

### Rooms and environmental history

- `list_rooms`
- `get_room`
- `list_room_plants`
- `get_environment_history`
- `compare_environment`

Sensor history is bounded to at most 500 records per request. Temperature is represented in Fahrenheit as the primary human-facing unit.

### Alerts

- `list_alerts`
- `get_alert`
- `summarize_active_alerts`

These are read-only. Acknowledgement/dismissal belongs to the future guarded-write stage.

### Analysis and analytics

- `get_plant_analyses`
- `get_analysis`
- `get_analysis_history`
- `get_plant_health_analytics`
- `compare_plants`

Plant-health analytics supports `7d`, `30d`, and `90d` timeframes. Comparisons leave unavailable metrics null rather than fabricating them.

### Canopy and trichomes

- `get_canopy_status`
- `get_trichome_capabilities`

`get_trichome_capabilities` is a preflight/read tool. Actual CannaAI-backed trichome image submission is a later compute-tool step because it requires image payload handling and explicit analysis semantics.

## Camera integration

Default:

```env
CAMERA_MODE=mock
```

HTTP camera/snapshot integration:

```env
CAMERA_MODE=http
CAMERA_SNAPSHOT_URL_TEMPLATE=https://your-cannaai-host/api/cameras/{cameraId}/snapshot.jpg
CAMERA_BEARER_TOKEN=
```

For production, prefer short-lived signed image URLs. Never expose permanent camera credentials through MCP structured content or widget HTML.

## Useful ChatGPT prompts

```text
Check whether my CannaAI backend is reachable and tell me what capabilities are available.
```

```text
List my grow rooms and show me the plants in the flowering room.
```

```text
Compare the last 100 environmental readings between my veg and flower rooms.
```

```text
Summarize my unacknowledged CannaAI alerts.
```

```text
Show the last 30 days of health analytics for plant <id>.
```

```text
Compare plants <id-1> and <id-2> using their available health analytics.
```

```text
What trichome-analysis devices and magnification does my CannaAI backend support?
```

## Validation

Run:

```bash
npm run check
```

The `0.3.0` suite covers configuration, secret-safe auth behavior, normalized HTTP errors, GET retries, arbitrary-URL rejection, health fallback, plant normalization, environment scoping, room and alert normalization, bounded sensor history, environmental comparisons, analyses/history, health analytics, canopy, trichome capabilities, capability fail-closed behavior, MCP tool registration, and real local HTTP integration shaped like current CannaAI routes.

## Public repository safety

Never commit:

- `.env`
- `CANNAAI_API_TOKEN`
- OpenAI/provider API keys
- private backend/tunnel URLs you intend to keep private
- camera bearer tokens
- permanent credential-bearing camera URLs
- signed snapshot URLs
- real grow exports, database dumps, or sensor dumps

`get_cannaai_status` returns only safe configuration/reachability metadata; it does not echo the configured backend URL or token.

## Roadmap toward fuller parity

The approved design lives at:

```text
docs/superpowers/specs/2026-08-13-cannaai-chatgpt-feature-parity-design.md
```

Implementation plans:

```text
docs/superpowers/plans/2026-08-13-stage1-real-backend-foundation.md
docs/superpowers/plans/2026-08-13-stage2-read-only-cultivation-parity.md
```

Next stages:

1. **Business/advisor parity** — advisors, AI insights, inventory, harvest/yield/business metrics where real backend endpoints exist.
2. **Richer ChatGPT views** — grow overview, environment trends, alerts, analysis/trichome results.
3. **Guarded automation parity** — status reads plus explicit preview/confirm action tickets for supported CannaAI mutations.

When a useful CannaAI feature has no callable read API, the preferred fix is to add a narrow endpoint to CannaAI rather than duplicate its logic inside the ChatGPT app.

## Security before public or multi-user deployment

Before exposing the app beyond a trusted development setup:

1. authenticate the public MCP endpoint
2. authorize each user to the correct grow/backend
3. use HTTPS
4. replace development wildcard CORS with an explicit allowlist
5. use exact widget CSP domains
6. rate-limit expensive snapshot/analysis operations
7. use signed short-lived camera URLs
8. audit consequential actions when guarded write parity is eventually enabled

See `SECURITY.md` for the repository security policy.
