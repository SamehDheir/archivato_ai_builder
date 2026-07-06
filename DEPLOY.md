# Deploying Archivato

Two supported paths:

1. **Single host (VPS)** — `docker-compose.prod.yml` runs db + redis + api + web.
2. **Managed hosting** — build the two Dockerfiles and point them at a managed
   Postgres + Redis (recommended for real production; you get backups, failover,
   and patching for free).

---

## 1. Prerequisites

- A domain (e.g. `example.com` for web, `api.example.com` for the API) with TLS.
  Put a reverse proxy (Caddy, Nginx, Traefik) in front to terminate HTTPS.
- Docker + Docker Compose on the host.
- A strong JWT secret: `openssl rand -base64 48`.

## 2. Configure

Copy `.env.example` to `.env` at the repo root and set at least:

```env
NODE_ENV=production
JWT_ACCESS_SECRET=<openssl rand -base64 48>     # boot fails if weak/missing
POSTGRES_PASSWORD=<strong password>

# Public URLs (cross-domain → SameSite=none; same-site → lax is fine)
WEB_ORIGIN=https://example.com
API_ORIGIN=https://api.example.com
COOKIE_SAMESITE=none            # requires HTTPS (COOKIE_SECURE is forced on)
TRUST_PROXY=true                # behind the reverse proxy

# Baked into the web bundle at build time:
NEXT_PUBLIC_API_URL=https://api.example.com/api
NEXT_PUBLIC_SITE_URL=https://example.com

# Recommended integrations
RESEND_API_KEY=...              # real email (or SMTP_*)
MAIL_FROM=no-reply@example.com
GROQ_API_KEY=...                # or LLM_PROVIDER=claude + ANTHROPIC_API_KEY
SENTRY_DSN=...                  # error monitoring (optional)
SUPER_ADMIN_EMAIL=you@example.com
SUPER_ADMIN_PASSWORD=<strong password>
```

> The API **refuses to boot** in production with a missing/weak `JWT_ACCESS_SECRET`
> or `COOKIE_SAMESITE=none` without Secure — see `apps/api/src/config/env.validation.ts`.

## 3. Build + run (single host)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This starts Postgres and Redis (with healthchecks), runs `prisma migrate deploy`
on API start, then boots the API (`:3001`) and web (`:3000`). Point your reverse
proxy at those ports.

## 4. Health checks

The API exposes probes at the **root** (outside the `/api` prefix), un-throttled:

| Path            | Use                                                        |
| --------------- | ---------------------------------------------------------- |
| `/health`       | **Liveness** — process is up. Cheap, no dependency checks. |
| `/health/ready` | **Readiness** — returns `503` if Postgres or Redis is down.|

Wire `/health` to your platform's **liveness** probe and `/health/ready` to the
**readiness** probe / load-balancer target check. The compose API service already
has a `/health/ready` healthcheck.

## 5. Backups

`docker-compose.prod.yml` stores Postgres in a named volume. Take regular dumps:

```bash
./scripts/backup-db.sh                       # → ./backups/archivato-<ts>.sql.gz
# cron (hourly):
0 * * * * cd /srv/archivato && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

Restore (destructive):

```bash
gunzip -c backups/archivato-<ts>.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d archivato
```

> On managed Postgres, rely on the provider's automated backups + point-in-time
> recovery instead — they survive host loss; a local volume does not.

## 6. Error monitoring

Set `SENTRY_DSN` and unhandled 5xx errors (via the global exception filter) are
reported to Sentry with request context. Unset → Sentry is a no-op. The startup
log confirms `Sentry error monitoring enabled` when active.

## 7. Migrations & zero-downtime

The API image runs `prisma migrate deploy` on start (fine for single-host). For
rolling deploys, run migrations as a **separate release step** and remove the
migrate command from the container `CMD` so instances don't race.

## Managed hosting (Render / Railway / Fly / etc.)

Build each image from the **repo root**:

```bash
docker build -f apps/api/Dockerfile -t archivato-api .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api \
  --build-arg NEXT_PUBLIC_SITE_URL=https://example.com \
  -t archivato-web .
```

Provision a managed Postgres + Redis, set the same env vars on the API service,
and use `/health/ready` as the health check. SMTP ports are often blocked on
these platforms — use Resend (`RESEND_API_KEY`) rather than SMTP.
