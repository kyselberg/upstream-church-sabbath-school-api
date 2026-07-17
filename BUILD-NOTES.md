# sabbath-api — Build Notes (authoritative engineering decisions)

Read this **first**, then the spec. Behavior source of truth:
- `../REQUIRMENTS.md` §5 (data model), §6 (RBAC matrix), §7 (flows), §10 (REST sketch), **Appendix A** (schema `src/db/schema.ts` + `drizzle/0000_init.sql` — reproduce the schema exactly).
- `../plan/10-repo-api.md` (modules + invariants + build order), `../plan/40-contracts.md` (public + internal endpoint shapes), `../plan/50-infra-deploy.md` (env), `../plan/70-decisions.md`.

This repo = **sabbath-api only** (NestJS). The `bot`/`web` repos are separate. api is the **single writer** to Neon Postgres; all mutations run in transactions and write `assignment_change`.

## Stack (locked)
- Node 22, TypeScript, **NestJS 11**, npm.
- **Drizzle ORM** + `drizzle-kit`. DB driver: **`pg` (node-postgres) + `drizzle-orm/node-postgres`** (NOT neon-http — we need real multi-statement transactions for swap). Neon works over standard wire protocol.
- **better-auth** (latest 1.6.x) with `drizzleAdapter(db,{provider:'pg',schema,transaction:true})`, email+password enabled. Owns `user/session/account/verification`.
- `@nestjs/swagger` → `/docs` + `/docs-json` (contract source, DR-3).
- Validation: **class-validator + class-transformer** DTOs + global `ValidationPipe({whitelist:true, transform:true})`. Decorate DTOs with `@ApiProperty` for OpenAPI.
- Config: `@nestjs/config` reading `.env`.
- Tests: Nest default **Jest** (ts-jest). Ponytail-minimum but cover the invariants below.

## DB connection (locked)
- Runtime app pool: `DATABASE_URL` (pooled Neon endpoint — transactions verified OK).
- Migrations / `drizzle-kit` / seed DDL: **`DATABASE_URL_UNPOOLED`** (direct endpoint — verified).
- `drizzle.config.ts` → `dialect:'postgresql'`, `schema:'./src/db/schema.ts'`, `out:'./drizzle'`, `dbCredentials:{ url: process.env.DATABASE_URL_UNPOOLED }`.
- Provide the Drizzle instance via a Nest provider (token `DB` or `DRIZZLE`), a singleton `pg.Pool({connectionString: DATABASE_URL})` + `drizzle(pool,{schema})`. Export from a global `DbModule`.

## Schema (locked)
- Reproduce Appendix A `src/db/schema.ts` **exactly** (table/column/enum/index names as written). `class` table is exported as `klass`.
- **Auth tables**: generate `user/session/account/verification` with the better-auth CLI (`npx @better-auth/cli generate --config ./src/auth/auth.ts --output ./src/db/auth-schema.ts`) in **Drizzle** format, then export them from `schema.ts` too so ONE migration system (drizzle) creates everything. Keep `member.userId → user.id` FK. The Appendix A `user` stub: replace with the better-auth-generated `user` table (superset of the stub columns) so the FK still resolves. Do NOT run better-auth's own migrator — drizzle owns migrations.
- Migration flow: `drizzle-kit generate` (from schema.ts) → `drizzle-kit migrate` (idempotent, tracked). Provide npm scripts `db:generate`, `db:migrate`, `db:seed`.

## Seed (locked) — `src/db/seed.ts`, idempotent (only-missing, safe re-run)
- Permissions (keys from §6): `member.read, member.manage, class.read, class.manage, schedule.read, schedule.assign, schedule.assign.own, swap.propose, swap.approve, announcement.send, role.manage, settings.manage, telegram.link, telegram.link.self`.
- Roles: `superadmin, admin, teacher` (is_system=true).
- role_permission matrix (§6):
  - **teacher**: schedule.read, schedule.assign.own, swap.propose, member.read, class.read, telegram.link.self.
  - **admin**: everything teacher has + member.manage, class.manage, schedule.assign, swap.approve, announcement.send, telegram.link.
  - **superadmin**: ALL permissions (incl. role.manage, settings.manage).
- `app_settings` singleton row id=1 with schema defaults (tz Europe/Kyiv, weekday=3, hour=9, minute=0, pin_weekly=true, undo_window_minutes=30, llm_model default, bot_locale='uk'). Use `onConflictDoNothing`.
- Seed 4 classes (`Клас 1..4`, sort_order 1..4) if none exist.
- Optional: a bootstrap `superadmin` member is created lazily by the auth hook (see Auth), not in seed.

## Auth (locked) — `src/auth/`
- `auth.ts`: `betterAuth({ database: drizzleAdapter(db,{provider:'pg',schema,transaction:true}), emailAndPassword:{enabled:true}, secret: BETTER_AUTH_SECRET, baseURL: BETTER_AUTH_URL, trustedOrigins:[WEB_ORIGIN] })`.
- Mount in `main.ts` with `NestFactory.create(AppModule,{bodyParser:false})`. Register better-auth BEFORE json parsing via a prefix-checking middleware (version-agnostic; avoids Express-5 wildcard syntax):
  ```ts
  const expressApp = app.getHttpAdapter().getInstance();
  const authHandler = toNodeHandler(auth);
  expressApp.use((req,res,next)=> req.originalUrl.startsWith('/api/auth') ? authHandler(req,res) : next());
  app.use(json()); app.use(urlencoded({extended:true}));   // express json for the rest
  ```
- On **new user sign-up**, link to a `member`: use a better-auth `databaseHooks.user.create.after` (or `after` hook) to `insert member {fullName: user.name ?? email, userId: user.id}`. If it's the **first** user overall, also grant `superadmin` (bootstrap). This makes the local instance usable end-to-end.
- `SessionGuard`: reads `auth.api.getSession({headers: fromNodeHeaders(req.headers)})`; attaches `req.session` + resolves `req.member` (by `member.userId`). 401 if no session on public protected routes.

## RBAC (locked) — `src/rbac/`
- `@RequirePermissions('schedule.assign', ...)` decorator (SetMetadata) + `PermissionGuard` (runs after SessionGuard): resolve actor member → roles → permissions (join role_permission), check ALL required are present. superadmin short-circuits allow.
- ABAC `schedule.assign.own`: guard cannot see the target row generically → enforce in the **schedule service** for teacher-scoped ops: allow if `assignment.memberId === actor.id || assignment.originalMemberId === actor.id`, else 403. Guard grants entry if actor has either `schedule.assign` (any) OR `schedule.assign.own`; service tightens `.own`.
- Future `class_lead`/`scope_class_id`: leave a TODO(seam), do NOT implement (Phase 3).

## Error envelope (locked)
- Global `AllExceptionsFilter` → error responses `{ error: { code, message } }` with sensible HTTP status. `code` = machine slug (e.g. `not_found`, `forbidden`, `validation_failed`, `conflict`, `undo_window_expired`, `not_saturday`, `not_in_pool`). Success responses are raw JSON (contracts show unwrapped objects, e.g. `{id, fullName}`).
- Map domain errors: UNIQUE(class,date) conflict → 409 `conflict`; not-a-Saturday → 422 `not_saturday`; substitute not in pool → 422 `not_in_pool`; undo outside window / repeated → 409 `undo_window_expired`.

## Internal API (locked) — `src/internal/`
- `InternalTokenGuard`: constant-time compare `X-Internal-Token` header vs `INTERNAL_TOKEN`; 401 otherwise. Applied to ALL `/internal/*` controllers. These are thin wrappers over the same services the public controllers use (source='telegram').
- Exact endpoint list + request/response shapes: **`../plan/40-contracts.md`** (reproduce precisely). bigints (telegram_user_id, chat_id, message_id) travel as JSON numbers.
- `api→bot` announce: a small `BotClient` service that POSTs `${BOT_ANNOUNCE_URL}/internal/announce` with `X-Internal-Token`. Bot isn't running locally → on network error, log a warning and still return success for the mutation (announce is best-effort). Never let a bot outage roll back a committed DB change.

## Domain invariants (MUST have tests)
- `assignment` UNIQUE(class_id,date) — one presenter per class per date.
- date is a **Saturday**: `new Date(date+'T00:00:00Z').getUTCDay()===6`. Shared `isSaturday()` util; validated before every write.
- `saturdaysBetween(start,end)` — iterate in **UTC** (date-only; DST-immune): build at UTC midnight, step `setUTCDate(+1)`, collect `getUTCDay()===6`. Unit test incl. a range crossing the Europe/Kyiv DST switch (last Sun Mar / last Sun Oct) — result must be pure calendar Saturdays.
- **swap** atomic: single tx updates both assignments + writes 2 `assignment_change` rows sharing one `swap_group_id`; UNIQUE conflict → whole tx rolls back.
- **undo(ref, byMember)**: `ref` = `change:<id>` or `swap:<groupId>`; only within `app_settings.undo_window_minutes` of the change's `created_at`; reverses the assignment(s), writes reverse change row(s), stamps `undone_at`/`undone_by_member_id`; repeated undo of same ref → no-op error `undo_window_expired`/`already_undone`.
- idempotency: `announcement` UNIQUE(type,target_date) claim; `agent_action_log` UNIQUE(update_id) claim. Claim = `insert ... onConflictDoNothing returning` → fresh/claimed boolean.

## Conventions
- **Zero comments** unless a why/gotcha isn't expressible in code (project rule). No section-divider or restating comments.
- Prettier defaults, ESLint (nest default). `npm run build` must pass with no TS errors before you report done.
- Keep it lazy/minimal (ponytail): no speculative abstractions, no extra deps. Use Nest CLI generators where they save boilerplate.

## Acceptance per slice
Each build agent MUST end by running `npm run build` (tsc) and reporting PASS/FAIL + any endpoint smoke it ran. Do not report success on a failing build.
