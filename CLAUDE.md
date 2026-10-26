# CLAUDE.md — Damascus Airport Operations Control System

## 1. Project overview

- Operations platform for Damascus Airport, replacing the operational workflows currently run in **Odoo**.
- Core flow: **flights → staffing needs → assignments → attendance → exceptions & reports**.
- **Not general HR**: no payroll, leave balances, recruitment, or performance reviews.
- Pilot runs alongside Odoo; cutover only after the acceptance checklist (§11) passes, including tested backups/recovery.
- MVP = Phases 1–3 below. Phases 4–5 must not be built early.

| Phase                              | Scope                                                                                                                                                                            | Priority |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1 Foundation & data import         | Auth + 5 roles, staff directory & teams, flight DB, CSV/Excel import preview, audit trail, Odoo reconciliation                                                                   | MVP      |
| 2 Flights & assignments            | Arrivals/departures list + day timeline, create/edit/reschedule/cancel flights, handling windows & required staff counts, assign teams/individuals, server-side overlap blocking | MVP      |
| 3 Attendance & control dashboard   | Check-in/out, breaks, absences, scheduled vs. available staff, coverage dashboard, alerts for missing staff / uncovered flights, daily report                                    | MVP      |
| 4 Roster automation & integrations | Recurring shifts, 12-on/24-off rosters, flight feed sync + stale-data warnings, live updates, overtime                                                                           | Later    |
| 5 Optimization & forecasting       | Demand forecasts, staffing model comparison, assignment recommendations, KPIs, PDF/Excel reports                                                                                 | Later    |

## 2. Commands (pnpm only)

```sh
pnpm dev            # dev server
pnpm build          # production build (Vercel adapter)
pnpm check          # svelte-kit sync + svelte-check (types)
pnpm lint           # prettier --check + eslint
pnpm format         # prettier --write
pnpm db:generate    # drizzle-kit generate (SQL migration from schema diff)
pnpm db:migrate     # apply migrations
pnpm db:studio      # Drizzle Studio
pnpm drizzle-kit generate --custom --name=<name>   # empty migration for hand-written SQL
pnpm auth:create-admin <id> "<name>" [--name-ar ..] [--days 1|7|30] [--force]   # first admin, prints a 6-digit code once
pnpm auth:issue-code <id> [--days 1|7|30]          # recovery: new code, clears lockout, signs the account out
```

- **Do not use `pnpm db:push`** once migrations exist. It bypasses custom SQL migrations (exclusion constraints, seeds; see §7).
- Run `pnpm check` and `pnpm lint` before declaring work done.

## 3. Stack & conventions (non-default — read carefully)

| Area       | Rule                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | **SvelteKit 3** + **Svelte 5**, runes forced for all project files (`vite.config.ts`). Use `$state`, `$derived`, `$effect`, `$props`; no `export let`, no stores in new code.                                                                                                                                                                                                                |
| Imports    | Alias is **`#lib`** (Node subpath imports in `package.json`), **not `$lib`**. e.g. `import { cn } from '#lib/utils.js'`.                                                                                                                                                                                                                                                                     |
| Env vars   | Declare in `src/env.ts` via `defineEnvVars`, read from **`$app/env/private`**. Add every new var to `.env.example` too. Never commit `.env`.                                                                                                                                                                                                                                                 |
| DB         | Drizzle ORM 0.45 + `drizzle-orm/neon-http` + Neon Postgres (`src/lib/server/db/index.ts`). See §7.                                                                                                                                                                                                                                                                                           |
| Forms      | `sveltekit-superforms` v3 with the **`zod4`** adapter (`sveltekit-superforms/adapters`), `zod` v4 (`z.email()`, not `z.string().email()`). Keep the schema in a sibling `schema.ts`; validate again in the action.                                                                                                                                                                           |
| UI         | Tailwind CSS 4 (`src/routes/layout.css`), shadcn-svelte (style `lyra`) in `#lib/components/ui`. Add components with `pnpm dlx shadcn-svelte@latest add <name>`. Use `cn()` from `#lib/utils.js`.                                                                                                                                                                                             |
| Cards      | Use `Card.*` from `#lib/components/ui/card` for any card/panel. **Never change a card's border**: no `border`/`ring`/`rounded` overrides on `Card.Root`, and no hand-rolled `border bg-card` look-alikes.                                                                                                                                                                                    |
| Icons      | **phosphor-svelte** (the `components.json` icon library), imported per icon: `import ListIcon from 'phosphor-svelte/lib/ListIcon'`. Don't add new lucide usages.                                                                                                                                                                                                                             |
| Feedback   | `svelte-sonner` toasts (`<Toaster />` is in the root layout); `mode-watcher` (`<ModeWatcher />` in the root layout) for dark mode.                                                                                                                                                                                                                                                           |
| Dates      | `@internationalized/date` for timezone-aware display/parsing. Show instants with `formatDateTime()` from `#lib/utils/datetime.js` (Asia/Damascus, current locale) inside `<bdi>`.                                                                                                                                                                                                            |
| i18n       | Paraglide JS: `en` (base) + `ar`, strategy `['url', 'cookie', 'baseLocale']` (`/ar/...` prefix). Messages in `messages/{en,ar}.json`; use `m.key()` from `#lib/paraglide/messages.js`. `src/lib/paraglide/` is generated — never edit it.                                                                                                                                                    |
| Links      | Internal links are **always** `localizedHref('/route')` or `localizedHref('/route', 'ar')` from `#lib/i18n.js`, which returns `localizeHref(resolve(url), { locale })`. Never a plain `href="/x"` or `resolve()` alone (drops `/ar`). It accepts param-free routes only; dynamic routes (`/flights/[id]`) need a params overload when added. `paths.relative` is `false` so it works in SSR. |
| Deploy     | `@sveltejs/adapter-vercel` → serverless functions. No long-lived processes or WebSocket servers.                                                                                                                                                                                                                                                                                             |
| Svelte MCP | For every `.svelte` / `.svelte.ts` file created or edited, run the Svelte MCP `svelte-autofixer` until it reports no issues. Use `get-documentation` for SvelteKit 3 / Svelte 5 APIs instead of guessing.                                                                                                                                                                                    |

## 4. Directory layout (current + planned)

```
src/env.ts                       env var declarations (DATABASE_URL*, AUTH_JWT_SECRET)
src/hooks.server.ts              paraglide middleware, then handleAuth (Bearer JWT or session cookie → locals)
src/lib/server/db/               index.ts (Drizzle client), schema/{auth,rbac,audit,index}.ts (more files per §7)
src/lib/server/auth/             login, session, jwt, credentials (6-digit codes), password (Argon2), rate-limit, api
src/lib/server/rbac/             permissions.ts (keys, role scopes), guard.ts (requireSignedIn / requireUser / requirePermission)
src/lib/server/audit.ts          auditInsert() for db.batch
src/lib/server/services/         business logic, no HTTP: users.ts (done); flights, assignments, attendance, imports (planned)
src/lib/components/ui/           shadcn-svelte components (generated, edit sparingly)
src/lib/app/                     app-specific components (layout shell, UserMenu, nav)
src/routes/(app)/                authenticated area with the top Header; +layout.server.ts requires a session
src/routes/(dashboard)/          authenticated area with the sidebar: dashboard/, employees/, admin/users/
  planned: flights/ staff/ teams/ assignments/ attendance/ reports/ imports/
src/routes/login/                ID number + 6-digit code sign-in;  src/routes/logout/ POST sign-out
src/routes/api/auth/             JSON token API for a future CSR client: token, refresh, logout, me
scripts/                         auth CLI (create-admin, issue-code), run with tsx outside SvelteKit
messages/                        en.json, ar.json
```

- Route `load` functions and `actions` stay thin. They parse input, call a service, and map errors.
- Services receive an `actor` (current user + permissions). Each one performs the permission check, the mutation, and the audit write.
- Everything touching the DB lives under `src/lib/server/` so it can never be bundled to the client.

## 5. Domain model

### Roles (seeded keys)

| Key                  | Name               | Responsibility                                                                             | Typical access                                                        |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `admin`              | Admin              | User accounts, role permissions, settings, operational configuration                       | Users & roles, configuration, all modules, audit logs                 |
| `operations_manager` | Operations Manager | Oversees operations, flight schedules, staffing rules, roster planning, approves plans     | Flights, workforce, rosters, assignments, reports, staffing scenarios |
| `supervisor`         | Supervisor         | Monitors teams, confirms attendance, oversees flight handling, reports shortages/incidents | Team schedules, attendance, assigned flights, alerts                  |
| `dispatcher`         | Dispatcher         | Maintains flight info, assigns staff, responds to delays/conflicts                         | Flight board, availability, assignments, rescheduling, live alerts    |
| `viewer`             | Viewer             | Read-only dashboards/reports                                                               | Read-only within the scope an admin grants                            |

These descriptions are **proposed defaults**. The final permission matrix is still to be agreed with the ops team (§10), which is why it lives in the DB (§7).

### Glossary

- **Handling window**: the time span around STA/STD (scheduled arrival/departure) during which assigned staff are busy with a flight.
- **Staffing requirement**: the headcount required per handling function for one flight.
- **Assignment**: one staff member on one flight for that flight's handling window. A team assignment expands into individual assignments.
- **Coverage**: active assignments ÷ required, per function and in total. A flight with coverage < 100% is an **uncovered flight**.
- **Shift**: scheduled availability of a staff member.
- **Attendance event**: check-in, check-out, break start, or break end.
- **Missing staff**: the shift has started and there is no check-in.
- **Available staff**: scheduled − absent − missing − on break.

**MVP workflow:** import flights & staff → review flight schedule → set staffing needs → assign teams & people → record attendance → monitor exceptions & report.

## 6. Non-negotiable rules

1. **Enforce permissions on the server.** Every `load` and action calls `requirePermission(locals, '<key>')`, or the service it delegates to does. Hiding buttons is cosmetic only: a Viewer posting to any action must get 403.
2. **No silent double-booking.** Overlapping assignments for the same staff member are rejected by a Postgres exclusion constraint (§7). The app also pre-checks to show a friendly message. Map SQLSTATE `23P01` to a localized conflict error and never swallow it.
3. **Audit every mutation.** Changes to flights, assignments, attendance, staff, roles/permissions, settings, and imports write an `audit_log` row **in the same `db.batch([...])`** as the change. Manual overrides (window override, forced assignment, attendance correction) require a `reason`.
4. **Time.** Store all instants as `timestamptz` (UTC). Display and enter them in **`Asia/Damascus`** via `@internationalized/date`. Never use naive timestamps or rely on server-local time (Vercel runs in UTC).
5. **i18n & RTL.** Every user-facing string goes in **both** `messages/en.json` and `messages/ar.json`. Use logical Tailwind utilities (`ms-/me-/ps-/pe-/start-/end-`, `text-start/text-end`, `rtl:` variants), never `ml-/mr-/pl-/pr-/left-/right-`. Times and flight numbers stay LTR inside RTL text.
6. **Never hard-delete operational records.** Flights → `status = 'cancelled'`, staff/users → `active = false`, assignments → `status = 'cancelled'`. History must reconcile for daily reports.
7. **Keep out of the MVP** (from the brief):

| Feature                       | Why defer                                                   | Build when                                                     |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| AI staffing forecasts         | Needs clean historical flights, demand, actual work records | Core data reliable, enough history                             |
| Automatic roster optimization | Rest rules, shift policy, constraints not yet agreed        | Manual rosters & availability rules validated                  |
| Multiple live flight APIs     | Integration complexity delays core workflow                 | Start with validated import; add one verified source at a time |
| Advanced productivity scoring | Misleading without consistent handling-time data            | Handling & attendance data reconciled                          |

8. **Live updates.** The brief mentions Socket.IO for Phase 4, but Vercel serverless cannot host it. In the MVP use `invalidate()`/`invalidateAll()` polling or SSE. A realtime service would need a separate host, so ask the user before adding one.

## 7. Database (Drizzle)

### Current state

- `drizzle.config.ts`: `dialect: 'postgresql'`, `strict: true`, schema at `./src/lib/server/db/schema` (split files). `DATABASE_URL_UNPOOLED` or `DATABASE_URL` must be set to run any drizzle-kit command.
- `src/lib/server/db/index.ts`: `drizzle(neon(DATABASE_URL), { schema })` over **neon-http**.
- Applied migrations `drizzle/0000`–`0005`: auth / RBAC / audit tables, RBAC seed, `session.client`, code credential columns, `user.issue_code` seed, drop of `must_change_password`. The demo `task` table is gone.

### neon-http constraints

- **No interactive transactions** (`db.transaction(async tx => …)` is unsupported). Use **`db.batch([q1, q2, …])`**, which runs atomically in one transaction.
- Logic that must read and then write atomically (overlap checks) relies on **DB constraints**, not app-level checks.
- If a feature truly needs interactive transactions, propose switching that path to `drizzle-orm/neon-serverless` (WebSocket `Pool`, created per request) and ask first.

### Conventions

- Split the schema into `src/lib/server/db/schema/{auth,rbac,workforce,flights,assignments,attendance,imports,audit,settings}.ts` with `schema/index.ts` re-exporting everything. Update `drizzle.config.ts` `schema` to `./src/lib/server/db/schema` when doing so.
- Name tables and columns explicitly in snake_case, singular: `pgTable('flight', { scheduledAt: timestamp('scheduled_at', …) })`.
- IDs: `uuid('id').primaryKey().defaultRandom()` for domain tables. FKs to `user.id` are `uuid` (auth is hand-rolled, §8).
- Timestamps: `timestamp('…', { withTimezone: true })` everywhere. Every mutable table gets `created_at` (`defaultNow()`) and `updated_at` (`.$onUpdate(() => new Date())`).
- Use `pgEnum` for closed sets and lookup tables for sets the ops team configures.
- Relations: `relations()` (v1 API in drizzle-orm 0.45) so the `db.query.*` relational API works.
- Types: export `typeof table.$inferSelect` / `$inferInsert`. Derive zod schemas from tables (drizzle-zod) instead of duplicating them by hand.
- Migration workflow: edit the schema → `pnpm db:generate` → **read the generated SQL** → `pnpm db:migrate`. Put DDL that Drizzle can't express (extensions, EXCLUDE, seeds) in `drizzle-kit generate --custom`.

### Entities (Phases 1–3)

| Area        | Table                              | Key columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `user`, `session`, `login_attempt` | **Built.** `user`: `login_id` (digits, unique), names, `role_id`, `active`, `password_hash` (Argon2 of the 6-digit code), `password_changed_at` / `password_expires_at` (code issued / expires), `failed_login_count`, `locked_at`, `last_login_at`, `created_by`. `session`: `id` = SHA-256 of the token, `client` (`web`/`api`), `expires_at`. `login_attempt`: insert-only rate-limit log (30-day retention)                                 |
| RBAC        | `role`                             | `key` unique (5 seeded keys from §5), `name_en`, `name_ar`                                                                                                                                                                                                                                                                                                                                                                                      |
|             | `permission`                       | `key` unique: `flight.read`, `flight.write`, `assignment.write`, `attendance.record`, `staff.write`, `import.run`, `report.read`, `user.manage`, `user.manage_operational`, `user.issue_code`, `settings.manage`, `audit.read` (seeded)                                                                                                                                                                                                         |
|             | `role_permission`                  | PK (`role_id`, `permission_id`)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Workforce   | `staff_function`                   | Configurable lookup (ramp, baggage, check-in, gate…): `key`, `name_en`, `name_ar`                                                                                                                                                                                                                                                                                                                                                               |
|             | `team`                             | `name`, `supervisor_staff_id` → `staff`, `active`                                                                                                                                                                                                                                                                                                                                                                                               |
|             | `staff`                            | `employee_no` unique, `full_name`, `full_name_ar`, `phone`, `function_id`, `team_id`, `user_id` nullable unique, `active`, `odoo_id` nullable unique                                                                                                                                                                                                                                                                                            |
|             | `shift`                            | `staff_id`, `starts_at`, `ends_at`, `status`, check `ends_at > starts_at`. Manual/imported in the MVP, generated in Phase 4                                                                                                                                                                                                                                                                                                                     |
| Flights     | `flight`                           | `airline_code`, `flight_no`, `direction` enum (`arrival`/`departure`), `origin`, `destination` (IATA), `scheduled_at`, `estimated_at`, `actual_at`, `status` enum (`scheduled`/`delayed`/`boarding`/`departed`/`arrived`/`cancelled`/`diverted`), `stand`, `gate`, `aircraft_type`, `handling_starts_at`, `handling_ends_at`, `source` enum (`manual`/`import`/`feed`), `external_ref`. Unique (`source`, `external_ref`); index `scheduled_at` |
|             | `handling_window_rule`             | `direction`, optional `aircraft_category`, `minutes_before`, `minutes_after`. Computes the default window; per-flight overrides are audited                                                                                                                                                                                                                                                                                                     |
|             | `flight_staffing_requirement`      | `flight_id`, `function_id`, `required_count` (> 0); unique (`flight_id`, `function_id`)                                                                                                                                                                                                                                                                                                                                                         |
| Assignments | `assignment`                       | `flight_id`, `staff_id`, `team_id` nullable, `starts_at`, `ends_at` (copied from the handling window), `status` enum (`assigned`/`cancelled`/`completed`), `assigned_by`, `override_reason`. Indexes `flight_id`, (`staff_id`, `starts_at`)                                                                                                                                                                                                     |
| Attendance  | `attendance_event`                 | **Append-only**: `staff_id`, `shift_id` nullable, `type` enum (`check_in`/`check_out`/`break_start`/`break_end`), `occurred_at`, `recorded_by`, `note`. Index (`staff_id`, `occurred_at`). Corrections are new events with a reason, never edits                                                                                                                                                                                                |
|             | `absence`                          | `staff_id`, `starts_at`, `ends_at`, `type` enum (`sick`/`leave`/`no_show`/`other`), `reason`, `recorded_by`                                                                                                                                                                                                                                                                                                                                     |
| Imports     | `import_batch`                     | `kind` (`staff`/`flights`), `file_name`, `status` enum (`previewed`/`committed`/`failed`), `created_by`, row counts                                                                                                                                                                                                                                                                                                                             |
|             | `import_row`                       | `batch_id`, `row_no`, `raw` jsonb, `parsed` jsonb, `errors` jsonb, `action` (`create`/`update`/`skip`), `target_id`. Drives import preview and Odoo reconciliation                                                                                                                                                                                                                                                                              |
| Audit       | `audit_log`                        | **Insert-only**: `actor_user_id`, `action`, `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `reason`, `created_at`. Indexes (`entity_type`, `entity_id`), `created_at`                                                                                                                                                                                                                                                               |
| Settings    | `app_setting`                      | `key` PK, `value` jsonb                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Required custom migrations

1. **Overlap constraint** (rule §6.2):
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE assignment ADD CONSTRAINT assignment_no_overlap
     EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
     WHERE (status <> 'cancelled');
   ```
2. **RBAC seed** (done: `0001_seed_rbac`, `0004_seed_issue_code`): the 5 roles, all permission keys, and the default `role_permission` matrix. Permission keys are also exported as constants from `#lib/server/rbac/permissions.ts`. Keep the two in sync: adding a key means changing both the constant and a new seed migration.

### Derived data (computed at query time in the MVP, not stored)

- Coverage per flight comes from requirements vs. active assignments.
- Missing staff are shifts with `starts_at <= now()` and no `check_in` event.
- Scheduled vs. available comes from shifts − absences − missing − on break.
- Add an `operational_alert` table only once alerts need acknowledgement or escalation.

### Phase 4+ (do not build yet)

`roster_pattern` (recurring / 12-on-24-off), `flight_feed_sync`, overtime calculations, forecasting tables.

## 8. Authentication (built — details and history in `AUTH_PLAN.md`)

Hand-rolled, no auth library. Change it only together with `AUTH_PLAN.md`.

- **Who signs in:** only `admin` and `operations_manager` accounts (`ACCOUNT_ROLES`). Employees have no accounts; the employee scopes (`EMPLOYEE_ROLES`, `user.issue_code`, `user.manage_operational`) are dormant.
- **Credential:** ID number + a **6-digit code** issued by an admin at `/admin/users` (or `pnpm auth:issue-code`). Codes are random, shown once, Argon2id-hashed, expire (default 7 days), and can't be changed by their holder. There is no password and no change-password page.
- **Lockout:** 5 consecutive wrong codes lock the account until a new code is issued. Rate limit: 5 failures per ID (since the current code) or 20 per IP in 15 min.
- **Sessions:** a `session` row is the source of truth. Web: `httpOnly` cookie, 12 h sliding, never past the code's expiry. API (future CSR client): 10-min HS256 access JWT (`AUTH_JWT_SECRET`) + single-use rotating refresh token at `/api/auth/*`. Every request re-loads the session, so deactivation and new codes cut access immediately.
- **Enforcement:** `hooks.server.ts` fills `locals.user` / `session` / `permissions` / `authMethod`. Layout loads call `requireSignedIn(locals)`; every load and action that needs a permission calls `requirePermission(locals, key)` (or its service does). Services take an `Actor` and write `audit_log` in the same batch.
- **Never** log or return a code, cookie token, refresh token, or password hash; never put them in `audit_log`.

## 9. Scaffold cleanup (done)

- [x] Remove the demo `task` table.
- [x] Replace the marketing `Header.svelte` with the app navigation shell.
- [x] Build the real `src/routes/login/`.
- [x] Replace the `Hi` placeholder.
- [x] `git init`.

## 10. Open questions (ask; do not invent answers)

- The exact role → permission matrix.
- The list of handling functions and required headcount defaults per aircraft type.
- Handling-window minutes before/after STA/STD per direction and aircraft category.
- Assignment conflict rules: is a minimum rest or travel buffer between consecutive flights required?
- Shift and break policy (max hours, break lengths).
- Odoo export formats and field mapping for staff and flights.
- Pilot period date range and which flights are in scope.

## 11. MVP acceptance checklist

- [ ] All pilot-period flights are imported and reconciled against the source.
- [ ] Users only perform actions allowed by their assigned permissions.
- [ ] Overlapping staff assignments are rejected by the backend.
- [ ] Supervisors can record attendance and identify missing staff.
- [ ] Dispatchers can identify uncovered flights and update assignments.
- [ ] Flight changes and manual overrides are audited.
- [ ] Daily reports reconcile with flight, assignment, and attendance records.
- [ ] Backups and recovery are tested before switching away from Odoo.
