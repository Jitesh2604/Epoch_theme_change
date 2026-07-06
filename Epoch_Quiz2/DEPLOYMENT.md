# Deployment Guide — Epoch Quiz

Two deployable services:

| Service    | Tech                      | Port | Role                                   |
|------------|---------------------------|------|----------------------------------------|
| **web**    | nginx + built React SPA   | 80   | Serves the SPA, reverse-proxies `/api` |
| **server** | Node 22 + TypeScript API  | 3000 | REST API (`/api/v1`), mysql2 pool      |
| **db**     | MySQL 8.4                 | 3306 | Persistent store (managed by Prisma migrations) |

Everything is served **same-origin**: the browser calls `/api/v1/*` on the same
host it loaded the page from, and nginx forwards those requests to the API
container. The client's API base is the relative path `/api/v1`
(`client/src/lib/api.ts`), so **no `VITE_*` build-time API URL is needed** and
**no CORS** is involved in this topology.

---

## Option A — Docker Compose (recommended)

Prerequisites: Docker + Docker Compose.

```bash
# 1. Configure
cp .env.production.example .env
#    Edit .env — set DB_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, APP_URL.
#    Generate secrets:  openssl rand -hex 32

# 2. Build + start (server runs `prisma migrate deploy` automatically on boot)
docker compose up -d --build

# 3. First-boot seed (creates default subjects/classes + the admin account)
docker compose run --rm server npm run seed
#    Optional — load the 98-question sample bank:
#    (place questions_1_100.json in ./ first; it ships in this repo)
#    docker compose run --rm -w /app server npx tsx prisma/seed-questions.ts

# 4. Verify
curl -f http://localhost/api/v1/health        # {"success":true,"data":{"status":"ok",...}}
open http://localhost                          # SPA loads

# 5. Log in as admin (from seed output) and CHANGE THE PASSWORD immediately.
#    Default: admin@epoch.local / Admin@12345
```

Update to a new version:

```bash
git pull
docker compose up -d --build      # migrate deploy re-runs; it is idempotent
```

Logs / teardown:

```bash
docker compose logs -f server
docker compose down               # keeps the db_data volume
docker compose down -v            # ALSO deletes the database volume
```

---

## Option B — Manual / PaaS (two processes behind one proxy)

Use this on a VPS or a platform where you run the frontend and backend separately.

### Backend

```bash
cd server
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy         # apply schema to the target DB
npm run seed                      # first deploy only
NODE_ENV=production node dist/server.js   # listens on $PORT (default 3000)
```

### Frontend

```bash
cd client
npm ci
npm run build                     # emits client/dist/  (static files)
```

Serve `client/dist` from any static host / CDN **and** route `/api/*` to the
backend on the same public origin (nginx, Caddy, a platform rewrite rule, etc.).
The nginx server block in `client/nginx.conf` is a ready-to-use reference:
`try_files $uri /index.html` for the SPA, `proxy_pass` for `/api/`.

> If you cannot co-locate them on one origin and must serve the API on a
> different host, set `CORS_ORIGIN` on the backend to the SPA's exact origin.

---

## Environment variables

`server/src/config/env.ts` validates these at boot with zod and **exits if a
required one is missing or invalid** — so a misconfigured deploy fails fast.

### Required

| Variable             | Notes                                                        |
|----------------------|--------------------------------------------------------------|
| `DATABASE_URL`       | `mysql://user:pass@host:3306/db` — used by Prisma migrations |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | used by the runtime mysql2 pool (`src/lib/db.ts`) — keep in sync with `DATABASE_URL` |
| `JWT_ACCESS_SECRET`  | ≥ 16 chars; `openssl rand -hex 32`                           |
| `JWT_REFRESH_SECRET` | ≥ 16 chars; different from the access secret                 |

### Optional (sensible defaults)

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | set `production` in prod |
| `PORT` | `5000` | compose/`.env` use `3000` (5000 clashes with macOS AirPlay) |
| `API_PREFIX` | `/api/v1` | must match the client's `BASE` |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` | |
| `BCRYPT_SALT_ROUNDS` | `10` | 4–15 |
| `CORS_ORIGIN` | `http://localhost:5173,5174` | only matters for cross-origin deploys |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `900000` / `200` | **per-IP.** Raise `MAX` (e.g. 2000) for SPA traffic or users behind shared NAT — see Notes |
| `LOG_LEVEL` | `info` | |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | — | set all SMTP_* to send real password-reset emails; otherwise the reset token is returned in the API response (dev convenience) |
| `CONTACT_TO` | `mayank@epochstudio.net` | recipient of the contact form |
| `CONTENT_API_KEY` | — | blank = content-sync disabled |
| `CONTENT_SYNC_ENABLED` | `true` | daily job; set `false` if no `CONTENT_API_KEY` |

Full annotated reference: `server/.env.example`.

---

## Health checks

| Endpoint | Meaning |
|----------|---------|
| `GET /api/v1/health` | process is up (`{status:"ok"}`) |
| `GET /api/v1/health/db` | database reachable |

Point your load balancer / orchestrator liveness probe at `/api/v1/health` and
readiness at `/api/v1/health/db`.

---

## Notes / operational risks

- **Rate limiting is per-IP and global** (all endpoints, default 200 / 15 min).
  Behind a reverse proxy every request carries the client IP via
  `X-Forwarded-For` (the app reads it). If many users share one public IP
  (corporate NAT), they share the budget — raise `RATE_LIMIT_MAX` accordingly.
- **`prisma migrate deploy` runs on every server boot** (Option A). It only
  applies *pending* migrations and is safe to re-run. It never resets data.
- **Change the seeded admin password** (`admin@epoch.local`) immediately.
- **Secrets** live only in `.env` (git-ignored). Never bake them into images.
