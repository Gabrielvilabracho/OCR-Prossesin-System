# Sample VPS Operations Prep

This directory contains deployment examples for running the sample Python invoice-processing service behind Caddy. Do not deploy from these files without replacing placeholders, reviewing firewall rules, and approving the production change.

## Operating model

| Area | Decision |
| --- | --- |
| Provider | Hetzner VPS |
| Reverse proxy | Caddy |
| Python service | Containerized FastAPI/LangGraph service on port `8001` |
| Database | External Supabase/PostgreSQL |
| Storage | External Supabase Storage |
| Trigger.dev | Stays as-is |
| Redis / local Postgres / MinIO / Kubernetes | Not included in Phase 2 |
| Analytics | Optional profile, protected only |
| n8n | Optional/local-only until productive use is approved |

## Files

- `docker-compose.production.yml` — production compose example with Caddy, sample AI service, optional analytics, optional n8n.
- `../caddy/Caddyfile.example` — public and protected route example.
- `../../env/production/*.env.example` — placeholder-only environment templates.

## Quick path

1. Provision Hetzner VPS and configure DNS.
2. Harden SSH and firewall before exposing services.
3. Copy env files from `env/production/*.env.example` and fill real values on the VPS only.
4. Copy `ops/caddy/Caddyfile.example` to `ops/caddy/Caddyfile` on the VPS and replace placeholders.
5. Start the minimal stack:

```bash
docker compose -f ops/vps/docker-compose.production.yml up -d caddy sample-accounting-ai
```

6. Verify health:

```bash
curl -fsS https://<ai-domain>/health
```

Expected result: HTTP 200 from the Python service health endpoint.

## Optional profiles

Analytics and n8n are intentionally not public by default:

```bash
# Protected analytics only
docker compose -f ops/vps/docker-compose.production.yml --profile analytics up -d

# n8n is local/protected only until a production role is approved
docker compose -f ops/vps/docker-compose.production.yml --profile n8n up -d
```

## Guardrails

- Do not commit real secrets.
- Do not add Redis, local PostgreSQL, MinIO, or Kubernetes in Phase 2.
- Do not change Trigger.dev runtime model.
- Keep Supabase and Supabase Storage external for now.
- Keep analytics protected; do not expose it as a public dashboard.
- Keep n8n local/protected until productive use is approved.
