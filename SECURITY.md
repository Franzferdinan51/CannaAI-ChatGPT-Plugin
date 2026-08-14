# Security Policy

## Secrets and private data

Do not commit `.env`, `CANNAAI_API_TOKEN`, OpenAI/API provider keys, camera bearer tokens, private camera URLs, signed snapshot URLs, database dumps, or real sensor/grow exports. The included `data/` files are synthetic fixtures only.

Treat `CANNAAI_BASE_URL` as deployment configuration. A localhost example is safe to commit, but do not commit a private hostname, tunnel URL, or internal address if doing so reveals infrastructure you intend to keep private.

The MCP status/capability surface must never return the configured API token, Authorization header, or full private backend URL. Status responses should expose only safe booleans such as `baseUrlConfigured` and normalized error codes.

If a secret is accidentally committed, revoke or rotate it first, then remove it from Git history. Treat removal from the latest commit alone as insufficient.

## Backend request boundary

`CannaAIClient` is intentionally restricted to relative `/api/...` paths under the configured `CANNAAI_BASE_URL`. Do not add a generic arbitrary-URL fetch MCP tool or allow user input to replace the backend origin.

Read-only GET requests may retry one transient failure. Consequential write requests must not be automatically retried after an ambiguous network failure.

## Write and automation controls

The public starter defaults to:

```env
CANNAAI_ENABLE_WRITE_TOOLS=false
CANNAAI_ENABLE_AUTOMATION=false
```

Stage 1 exposes no destructive or physical automation MCP tools. Future automation support must use the approved preview/confirm action-ticket protocol and fail closed when authorization or target state cannot be verified.

## Deployment notes

The default server remains a development starter. Before exposing it to multiple users or the public internet:

- add authentication and user-to-grow authorization
- use HTTPS
- narrow CORS and widget CSP policies
- rate-limit snapshot/analysis tools
- use short-lived signed image URLs for private cameras
- avoid putting backend or camera secrets in structured content or widget-visible metadata
- keep audit logs free of secret values

## Reporting

For security issues in a public fork or deployment, use a private security-reporting channel rather than posting credentials or exploit details in a public issue.
