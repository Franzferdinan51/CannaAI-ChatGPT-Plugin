# CannaAI ChatGPT Plant App

A ChatGPT/MCP app that lets ChatGPT inspect CannaAI plant records, environmental data, camera snapshots, and plant imagery from a normal conversation.

The project now supports two data modes:

- **`mock`** — safe public-repo development using the included synthetic JSON fixtures.
- **`api`** — connects to a real [`CannaAI`](https://github.com/Franzferdinan51/CannaAI) backend and uses it as the source of truth.

Stage 1 of the feature-parity work replaces the old fixture-only data boundary with a real CannaAI client while preserving all existing MCP tool names.

## Current capabilities

- CannaAI backend reachability/status checks
- capability discovery so ChatGPT does not assume unfinished features exist
- list real or mock plants
- load a specific real or mock plant
- read plant-specific environmental metrics when the backend can actually associate readings with the plant
- fetch camera snapshots through the existing camera adapter
- optional server-side image analysis
- render the existing plant dashboard inside ChatGPT
- normalized errors, timeouts, one safe GET retry, and secret-safe status output

The larger parity design also covers rooms, environment history, alerts, trichomes, canopy, analytics, advisors, inventory, harvests, richer widgets, and guarded automation. Those later capability groups are intentionally reported as unavailable until implemented instead of being advertised prematurely.

## Architecture

```text
ChatGPT
  |
  | MCP /mcp
  v
CannaAI ChatGPT Plant App
  |-- MCP tools + ChatGPT widget
  |-- capability discovery
  |-- normalized schemas/errors
  |-- mock store (synthetic fixtures)
  `-- CannaAIClient (api mode)
          |
          | HTTP/HTTPS
          v
        CannaAI
          |-- /api/plants
          |-- /api/plants/{id}
          `-- /api/environment
```

The MCP layer does **not** copy CannaAI persistence or business logic. CannaAI remains authoritative in `api` mode.

## Requirements

- Node.js 20+
- npm
- A public HTTPS URL for ChatGPT to reach `/mcp` when testing from ChatGPT
- A running CannaAI instance for `CANNAAI_MODE=api`
- Optional: `OPENAI_API_KEY` for the local `analyze_plant_snapshot` fallback

## Install

```bash
npm install
cp .env.example .env
```

Node does not automatically load `.env` in this starter. Start with:

```bash
node --env-file=.env server.js
```

Development:

```bash
node --watch --env-file=.env server.js
```

The local MCP endpoint is:

```text
http://localhost:8787/mcp
```

## Mock mode

Mock mode is the default and requires no CannaAI server:

```env
CANNAAI_MODE=mock
CAMERA_MODE=mock
```

It reads only the synthetic files under `data/`.

## Connect to a real CannaAI instance

Set:

```env
CANNAAI_MODE=api
CANNAAI_BASE_URL=http://localhost:3000
CANNAAI_API_TOKEN=
CANNAAI_REQUEST_TIMEOUT_MS=15000
```

`CANNAAI_API_TOKEN` is optional because local CannaAI deployments may not require a bearer token. If your deployment does require one, keep it only in the environment; never commit it.

Stage 1 currently integrates with these real CannaAI endpoints:

```text
GET /api/plants
GET /api/plants/{id}
GET /api/environment
```

The client first probes `GET /api/health`. Current CannaAI versions may not expose that route, so a `404` is treated as a compatibility case and the plugin falls back to a lightweight plant-list probe rather than declaring the backend dead.

### Environment scope is intentionally conservative

The current CannaAI `/api/environment` route can return grow-wide sensor readings. The ChatGPT tool `get_environment` is plant-specific, so the plugin will **not** pretend a grow-wide reading belongs to a particular plant.

If the backend explicitly associates readings with the requested plant, they are returned. Otherwise `get_environment` returns no plant-specific environment data. Later parity stages add room/history-aware tools for grow-wide readings.

## New system tools

### `get_cannaai_status`

Use this to check whether the app is in mock or API mode and whether the configured CannaAI backend is reachable.

It intentionally reports only whether a base URL is configured. It does **not** return the configured private URL or API token.

### `get_cannaai_capabilities`

Use this before assuming optional CannaAI features exist. It returns a complete boolean capability map including:

- plants
- rooms
- environment
- environment history
- cameras
- image analysis
- trichome analysis
- analysis history
- alerts
- canopy
- analytics
- advisors / AI insights
- inventory / harvests
- automation read/write

Unimplemented or unreachable capabilities fail closed to `false`.

## Existing tool surface

### `list_plants`
Read-only. Lists normalized plant records from the selected data mode.

### `get_plant`
Read-only. Returns one plant by stable ID. In API mode it uses the detail route and enriches missing strain/location metadata from the list route when needed.

### `get_environment`
Read-only. Returns current **plant-associated** metrics. Temperature is normalized to Fahrenheit when the backend explicitly identifies Celsius input.

### `get_latest_snapshot`
Read-only/open-world. Calls the configured camera/CannaAI snapshot endpoint.

### `analyze_plant_snapshot`
Read-only/open-world. Retrieves a snapshot and uses the configured OpenAI vision model as the current fallback analyzer.

### `render_plant_dashboard`
Read-only render tool. Opens the inline ChatGPT dashboard for a selected plant.

## Camera integration

The default is:

```env
CAMERA_MODE=mock
```

For an HTTP snapshot endpoint:

```env
CAMERA_MODE=http
CAMERA_SNAPSHOT_URL_TEMPLATE=https://your-cannaai-host/api/cameras/{cameraId}/snapshot.jpg
CAMERA_BEARER_TOKEN=
```

For production, prefer short-lived signed image URLs. Do not expose permanent camera credentials in MCP output or widget HTML.

## Validate

```bash
npm run check
```

The check command syntax-checks the server and Stage 1 modules, then runs the Node test suite.

Stage 1 tests cover:

- config defaults/validation
- bearer auth behavior
- timeout/network/status normalization
- one retry for safe transient GET failures
- rejection of arbitrary external URLs
- health-route fallback behavior
- plant normalization and detail enrichment
- explicit Celsius-to-Fahrenheit conversion
- conservative environment scoping
- deterministic capability detection
- mock/API store behavior
- MCP system-tool contract checks
- an actual local HTTP integration flow shaped like the current CannaAI routes

## Connect to ChatGPT

Run the server and expose port `8787` through a public HTTPS tunnel, then connect the resulting HTTPS `/mcp` URL from ChatGPT Developer Mode. Refresh the app after tool metadata changes so ChatGPT reloads the descriptors.

Useful prompts:

```text
Check whether my CannaAI backend is reachable.
```

```text
What CannaAI capabilities are available right now?
```

```text
Show me my CannaAI plants.
```

```text
Open the dashboard for plant <id>.
```

## Public repository safety

This repository is designed to remain safe to publish. Committed fixture data is synthetic.

Never commit:

- `.env`
- `CANNAAI_API_TOKEN`
- OpenAI/API provider keys
- private CannaAI hostnames or tunnel URLs if they reveal private infrastructure
- camera bearer tokens
- permanent camera URLs containing credentials
- signed snapshot URLs
- real grow exports or sensor/database dumps

The status and capability tools are intentionally designed not to echo the configured backend URL or token.

## Write and automation safety

These variables are present now for the later guarded-automation stage but remain off by default:

```env
CANNAAI_ENABLE_WRITE_TOOLS=false
CANNAAI_ENABLE_AUTOMATION=false
```

Stage 1 exposes **no physical grow-control or destructive MCP tools**. Future write parity uses the approved preview/confirm action-ticket design rather than unrestricted commands.

## Feature-parity roadmap

The approved design is in:

```text
docs/superpowers/specs/2026-08-13-cannaai-chatgpt-feature-parity-design.md
```

Stage 1 implementation plan:

```text
docs/superpowers/plans/2026-08-13-stage1-real-backend-foundation.md
```

Planned next stages:

1. read-only cultivation parity: rooms, environment history, alerts, analysis history, CannaAI-backed photo analysis, trichomes, canopy, analytics
2. business/advisor parity: advisors, AI insights, inventory, harvests, yield/business metrics
3. richer ChatGPT widgets: grow overview, trends, alerts, analysis/trichome result views
4. guarded automation: status reads plus signed preview/execute action tickets

## Security before public/multi-user deployment

Before exposing the app beyond a trusted development setup:

1. authenticate the public MCP endpoint
2. authorize each user to the correct grow/backend
3. use HTTPS
4. replace development wildcard CORS with an explicit allowlist
5. use exact widget CSP domains
6. rate-limit expensive snapshot and analysis calls
7. use signed short-lived camera URLs
8. audit consequential actions when write parity is enabled later

See `SECURITY.md` for the repository security policy.
