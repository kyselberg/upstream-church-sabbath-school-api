# sabbath-api

NestJS backend for the Sabbath School scheduling bot. **Single writer** to a Neon Postgres DB. Serves two contracts:

- **Public REST** (`sabbath-web`): protected by better-auth sessions + RBAC (`§6` matrix).
- **Internal REST** (`sabbath-bot`, both directions): protected by a shared `X-Internal-Token`.

All schedule mutations run in transactions and write an `assignment_change` audit row. Swap is atomic; changes are reversible via `undo` within `app_settings.undo_window_minutes`.

## Stack

NestJS 11 · Drizzle ORM (`pg` / node-postgres) · better-auth (email+password) · `@nestjs/swagger` (OpenAPI at `/docs`, `/docs-json`) · class-validator.

## Run locally

```bash
cd api
cp .env.example .env          # fill DATABASE_URL(+_UNPOOLED), secrets, etc.
npm install
npm run db:generate           # drizzle migration from src/db/schema.ts
npm run db:migrate            # apply to Neon (uses DATABASE_URL_UNPOOLED)
npm run db:seed               # roles, permissions, §6 matrix, app_settings, 4 classes
npm run start                 # http://localhost:3000  (Swagger: /docs)
npm test                      # jest: dates + schedule integration invariants
npm run build                 # tsc / nest build
```

The **first user to sign up** is auto-linked to a `member` and granted `superadmin`:

```bash
curl -c cj.txt -X POST localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"password123","name":"Admin"}'
curl -b cj.txt localhost:3000/me     # -> user + member + 14 permissions
```

## Env

See `.env.example`. Every value is swappable; the app reads only from `.env`:
`DATABASE_URL` (pooled, runtime) · `DATABASE_URL_UNPOOLED` (direct, migrations) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `INTERNAL_TOKEN` (shared with the bot) · `BOT_ANNOUNCE_URL` (bot base URL for the `api→bot` announce edge) · `WEB_ORIGIN` (CORS) · `TELEGRAM_BOT_USERNAME` (deep-links) · `PORT`.

## API surface

- **Auth**: `/api/auth/*` (better-auth), `GET /me`.
- **Public** (session + RBAC): `/members` (+`/:id/telegram-token`), `/classes` (+`/:id/teachers`), `/quarters` (+`/:id/generate-saturdays`), `/assignments` (`PATCH` reassign, `/:id/substitute`, `/:id/mark-unavailable`, `/:id/announce`), `/swaps`, `/undo`, `/activity`, `/settings`.
- **Internal** (`X-Internal-Token`, `/internal/*`): member/class resolvers, `by-telegram`, `link-telegram`, schedule mutations (source=telegram), `settings`, `reminders/{claim,data,:id/sent}`, `agent-log/{claim,finish}`. Exact shapes: `../plan/40-contracts.md`.
- **api→bot**: `POST {BOT_ANNOUNCE_URL}/internal/announce` (best-effort; a bot outage never fails a committed change).

## Layout

```
src/
  db/        schema.ts (Appendix A) · auth-schema.ts · db.module.ts · seed.ts
  auth/      better-auth config + sign-up member/superadmin hook · SessionGuard · /me
  rbac/      PermissionGuard · @RequirePermissions · RbacService
  members/ classes/ quarters/ settings/    public CRUD + RBAC
  schedule/  transactional reassign/substitute/swap/mark-unavailable/undo + reads + tests
  announcements/ agent-log/                idempotent claim services
  internal/  InternalTokenGuard + all /internal endpoints
  announce/  BotClient + web→api→bot announce
  common/    dates.ts (isSaturday, saturdaysBetween) · all-exceptions.filter.ts
drizzle/     generated migration(s)
```

## Invariants (tested)

`assignment` UNIQUE(class_id, date) · dates are Saturdays (UTC, DST-immune) · mutations transactional + audited · swap atomic (shared `swap_group_id`) · undo within window, LIFO-only, snapshot-restore, no double-undo · idempotency via UNIQUE(type, target_date) and UNIQUE(update_id).

## Deploy (Railway)

Container-agnostic `Dockerfile` builds and runs `node dist/main.js` on `PORT`. Set the env from `.env.example` in Railway (secrets in the secret manager; `INTERNAL_TOKEN` must match `sabbath-bot`).

- **Build**: `npm run build` (or the Dockerfile).
- **Release step (run before serving)**: `npm run db:migrate` — idempotent, uses `DATABASE_URL_UNPOOLED`. Optionally `npm run db:seed` (only-missing).
- **Start**: `node dist/main.js`.
- Bind is `0.0.0.0:$PORT` (Nest default). Neon needs `sslmode=require` in the URL.

> Note: `swap` retries are not idempotency-keyed — a double-submit of the same swap within the undo window reverses it. Callers dedup: the bot claims `update_id` (`/internal/agent-log/claim`) before mutating; the web should disable double-submit. Add an idempotency key if this proves an issue at scale.
