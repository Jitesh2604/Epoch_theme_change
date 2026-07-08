# Deployment Guide — Epoch Quiz

Two deployable services:

| Service    | Tech                      | Port | Role                                   |
|------------|---------------------------|------|----------------------------------------|
| **web**    | nginx + built React SPA   | 80   | Serves the SPA, reverse-proxies `/api` |
| **server** | Node 22 + TypeScript API  | 3000 | REST API (`/api/v1`), Prisma Client     |
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
| `DATABASE_URL`       | `mysql://user:pass@host:3306/db` — the **only** DB URL the app/Prisma uses (queries + migrations) |
| `DB_PASSWORD` `DB_NAME` (`DB_HOST` `DB_PORT` `DB_USER`) | Docker-Compose only — they provision the MySQL container and build `DATABASE_URL` in `docker-compose.yml`. The app itself reads just `DATABASE_URL`. |
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

## Database migrations & the `0_init` baseline

The database is managed entirely by **Prisma Migrate** (`server/prisma/migrations`).
The history is a single **baseline migration, `0_init`**, that reflects the exact
current schema.

### Fresh environment (new, empty database)

Nothing manual — `migrate deploy` builds the whole schema from `0_init`:

```bash
cd server
npx prisma migrate deploy      # applies 0_init
npx prisma generate
npm run seed                   # default subjects/classes + admin account
```

### Why `0_init` exists (a deliberate history reset)

The original migration history had **drifted**: the `_prisma_migrations` table
recorded migrations that existed in no folder and no git commit, plus duplicate
half-applied rows. New migrations then failed even though the schema itself was
correct (the changes already existed in the DB). On **2026-07-08** the history
was **baselined** — Prisma's recommended fix for exactly this situation
([docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining)):
the six drifted folders were replaced by one `0_init` generated from the current
schema. This touched **migration metadata only — no application data** — and a
fresh `migrate deploy` was verified to reproduce the previous schema exactly
(identical tables, columns, indexes, foreign keys, enums, and defaults).

### Existing databases created BEFORE the baseline — one-time step

A database that predates `0_init` already has the correct tables, but its
`_prisma_migrations` table still lists the old (now-deleted) history. Run this
**once** per such environment, **after backing up**, then deploy normally forever:

```bash
# 1. Back up the migration-tracking table (metadata only)
mysqldump -u<user> -p <db> _prisma_migrations > _prisma_migrations.bak.sql
# 2. Reset it and record the baseline as already-applied (NO DDL, NO data change)
mysql -u<user> -p <db> -e "TRUNCATE TABLE _prisma_migrations;"
cd server && npx prisma migrate resolve --applied 0_init
# 3. Confirm
npx prisma migrate status       # -> "Database schema is up to date!"
```

Do **not** run this on fresh databases — they use `migrate deploy` (above).

### Creating new migrations going forward

Normal Prisma workflow — the chain starts cleanly at `0_init`:

```bash
npx prisma migrate dev --name <change>     # in development: create + apply
npx prisma migrate deploy                  # in CI/prod: apply pending
```

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
