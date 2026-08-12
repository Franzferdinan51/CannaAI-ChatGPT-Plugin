# CannaAI ChatGPT Plant App

A ChatGPT plugin/MCP app for inspecting plant records, environment data, and camera snapshots from normal ChatGPT conversations.

It exposes focused tools for:

- listing plants
- reading one plant record
- reading current environment data
- fetching a current camera snapshot
- optional server-side vision analysis of that snapshot
- rendering a plant dashboard inside ChatGPT

The app follows OpenAI's current Plugins / MCP Apps architecture: an MCP server exposes tools to ChatGPT and Codex, while an optional HTML UI resource renders inside ChatGPT.

## Architecture

```text
ChatGPT
  |
  | MCP /mcp
  v
CannaAI Plant App
  |-- plant data adapter (JSON fixtures now; replace with CannaAI DB/API)
  |-- environment adapter
  |-- camera snapshot adapter
  |-- optional OpenAI vision analysis
  `-- ChatGPT plant dashboard widget
```

## Requirements

- Node.js 20+
- A public HTTPS URL for ChatGPT to reach `/mcp` (ngrok is fine for development)
- Optional: `OPENAI_API_KEY` if you want `analyze_plant_snapshot`

## Install

```bash
npm install
cp .env.example .env
```

Node does not automatically load `.env` in this starter. Either export the variables in your shell or run Node with its env-file flag:

```bash
node --env-file=.env server.js
```

For development:

```bash
node --watch --env-file=.env server.js
```

The MCP endpoint is:

```text
http://localhost:8787/mcp
```

## Test locally

```bash
npm run check
curl http://localhost:8787/
```

Then expose it over HTTPS, for example:

```bash
ngrok http 8787
```

If ngrok gives you:

```text
https://example.ngrok-free.app
```

use this MCP URL in ChatGPT:

```text
https://example.ngrok-free.app/mcp
```

In ChatGPT, enable Developer Mode and add the MCP app/plugin from Settings, then refresh it whenever you change tool metadata.

## Public repository safety

This repository is designed to be safe to publish as source code. The committed files contain only synthetic fixture data and placeholder endpoint examples. Keep `.env` untracked and never commit API keys, camera bearer tokens, private camera URLs, signed snapshot URLs, or real grow/sensor exports.

`package.json` intentionally keeps `"private": true`; that prevents accidental publication to the npm registry and does **not** make the GitHub repository private.

## Camera integration

The starter defaults to:

```env
CAMERA_MODE=mock
```

To connect a CannaAI/IP-camera snapshot endpoint:

```env
CAMERA_MODE=http
CAMERA_SNAPSHOT_URL_TEMPLATE=https://your-cannaai-host/api/cameras/{cameraId}/snapshot.jpg
CAMERA_BEARER_TOKEN=optional-secret
```

The endpoint must return an image. For the cleanest ChatGPT/widget behavior, make the returned image URL short-lived/signed if the camera itself is private.

### Important production note

The current HTTP adapter validates a protected endpoint with `CAMERA_BEARER_TOKEN`, but the widget and server-side vision model subsequently need a usable image URL. A production CannaAI backend should therefore return a short-lived signed snapshot URL rather than exposing a permanent camera URL or credential.

## Replace fixture data with real CannaAI data

The only fixture-specific module is:

```text
src/store.js
```

Replace its functions while preserving the return shapes:

```js
listPlants()
getPlant(plantId)
getEnvironment(plantId)
getDashboardData(plantId)
```

That means the MCP tool layer does not need to change when you move from JSON to SQLite, Postgres, Home Assistant, MQTT, an Android node, or your existing CannaAI API.

## Useful prompts once connected

```text
Show me my plants.
```

```text
Open the dashboard for Demo Plant #1.
```

```text
What is the VPD and soil moisture on Demo Plant #1?
```

```text
Get the newest image from Demo Plant #1 and assess what looks different or stressed.
```

## Tool surface

### `list_plants`
Read-only. Returns stable IDs and plant metadata.

### `get_plant`
Read-only. Returns one plant by ID.

### `get_environment`
Read-only. Returns current environmental metrics.

### `get_latest_snapshot`
Read-only, open-world. Calls your camera/CannaAI snapshot endpoint.

### `analyze_plant_snapshot`
Read-only, open-world. Fetches the latest snapshot and, when an API key is configured, uses an OpenAI vision-capable model to inspect it together with plant/environment context.

### `render_plant_dashboard`
Read-only render tool. Opens the inline ChatGPT dashboard.

## Why the widget is plain HTML for v0.1

The MCP server is the important integration boundary. The first widget intentionally has no React/Vite build step, which makes local ChatGPT testing much simpler and closely follows the official OpenAI quickstart. It can be swapped for React later without changing the MCP tool contracts.

## Security before deploying beyond local development

Before a public or multi-user deployment:

1. add authentication and user-to-grow authorization
2. replace permissive CORS with an intentional policy
3. use exact CSP domains instead of the development wildcard
4. never place camera tokens or API keys in tool output or widget HTML
5. make camera image URLs signed and short-lived
6. rate-limit snapshot and analysis tools
7. store grow data server-side rather than JSON fixtures

## Next integration point

For a real deployment, wire `src/store.js` to your CannaAI backend and configure `CAMERA_SNAPSHOT_URL_TEMPLATE`. The rest of the app is already separated so those two changes are enough to turn the starter into a real plant monitor.
