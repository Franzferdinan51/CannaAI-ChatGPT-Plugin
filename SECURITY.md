# Security Policy

## Secrets and private data

Do not commit `.env`, API keys, bearer tokens, private camera URLs, signed snapshot URLs, database dumps, or real sensor/grow exports. The included `data/` files are synthetic fixtures only.

If a secret is accidentally committed, revoke or rotate it first, then remove it from Git history. Treat removal from the latest commit alone as insufficient.

## Deployment notes

The default server is a development starter. Before exposing it to multiple users or the public internet, add authentication and authorization, narrow CORS and CSP policies, rate-limit snapshot/analysis tools, and use short-lived signed image URLs for private cameras.

## Reporting

For security issues in a public fork or deployment, use a private security-reporting channel rather than posting credentials or exploit details in a public issue.
