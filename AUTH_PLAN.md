# Auth plan: ID number + issued 6-digit codes, sessions + JWT

Tracking file for the auth work (CLAUDE.md §8). Each step has an ID (`B4`, `F2`, …) so commits and
reviews can point at it. Tick a step when it has landed. Start the next phase only after the
previous checkpoint is verified.

**Status:** A ✅ · B ✅ · C ✅ · D ✅ · E ✅ · R ✅ · F ✅ · G ✅ · H ✅ — auth plan complete

## Decisions

Current as of the **2026-10-26 revision** (Phase R): the portal has three users, the admin and the
operations managers. Employees do not sign in. Nobody chooses or changes a password.

| Topic           | Decision                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who signs in    | **Admin** and **Operations Manager** accounts only. No public sign-up, no email login.                                                                                                                   |
| Credential      | **ID number + 6-digit code**, issued by an admin (or `pnpm auth:issue-code`). Shown once to the issuer, stored as an Argon2id hash. **No password change**: the holder can't choose or change it.        |
| Code expiry     | Every code expires: **7 days by default**; 24 h / 7 d / 30 d selectable. A session never outlives its code; once the code expires the user is signed out and needs a new code.                           |
| New code        | Issuing a code kills the old code, clears the lockout, and signs the account out everywhere.                                                                                                             |
| Lockout         | **5 consecutive wrong codes → locked** until a new code is issued. Applies to every account. Open sessions are kept.                                                                                     |
| Recovery        | If no admin can sign in (expired / locked), the owner runs `pnpm auth:issue-code <id>` on a machine with the DB credentials.                                                                             |
| Who issues      | **Admin** (`user.manage`): any account, **including their own next code** while signed in. Managers can't issue codes for admins or managers.                                                            |
| Employees       | Dormant: roles `supervisor` / `dispatcher` / `viewer`, `user.issue_code`, `user.manage_operational` stay in RBAC (scoped to `EMPLOYEE_ROLES`) in case employees get access later. No accounts today.     |
| Source of truth | A row in `session`. Every way of authenticating resolves to a session, so deactivation, new codes and role changes revoke access **immediately** for both web and API clients.                           |
| Web (SSR)       | `httpOnly` cookie with a random token; DB stores only its SHA-256. 12 h sliding expiry, capped at the code's expiry.                                                                                     |
| API (CSR/JWT)   | For a future CSR/mobile client: short-lived **access JWT** (HS256, `jose`, 10 min, `Authorization: Bearer`) + opaque **refresh token** (7 days, rotated on every use, stored hashed as a `session` row). |
| JWT checks      | Signature, `iss`, `aud`, `exp`, then the `sid` claim must point at a live session of an active user. A JWT alone is never trusted for authorisation; permissions are always loaded from the DB.          |
| Brute force     | ≥ 5 failures per ID or ≥ 20 per IP in 15 min → temporarily blocked, plus the lockout above.                                                                                                              |
| Permission seed | Proposed default matrix below. Still an open question with the ops team (CLAUDE.md §10), so it lives in the DB.                                                                                          |

Known trade-off: anyone who knows an admin's ID can lock that account with 5 wrong codes. Recovery is
`pnpm auth:issue-code`. Open with the ops team: the default code validity (7 days now).

### Proposed default permission matrix

| Permission                | admin | operations_manager | supervisor | dispatcher | viewer |
| ------------------------- | :---: | :----------------: | :--------: | :--------: | :----: |
| `flight.read`             |   ✓   |         ✓          |     ✓      |     ✓      |   ✓    |
| `flight.write`            |   ✓   |         ✓          |            |     ✓      |        |
| `assignment.write`        |   ✓   |         ✓          |            |     ✓      |        |
| `attendance.record`       |   ✓   |         ✓          |     ✓      |            |        |
| `staff.write`             |   ✓   |         ✓          |            |            |        |
| `import.run`              |   ✓   |         ✓          |            |            |        |
| `report.read`             |   ✓   |         ✓          |     ✓      |     ✓      |   ✓    |
| `user.manage`             |   ✓   |                    |            |            |        |
| `user.manage_operational` |   ✓   |         ✓          |            |            |        |
| `user.issue_code`         |   ✓   |         ✓          |     ✓      |            |        |
| `settings.manage`         |   ✓   |                    |            |            |        |
| `audit.read`              |   ✓   |         ✓          |            |            |        |

- `user.manage` (admin): every account, including issuing their own next code.
- `user.manage_operational` / `user.issue_code`: employee accounts only (`EMPLOYEE_ROLES`), never your own.
  Dormant while employees have no accounts.

## Flows

```
Accounts (admin, operations managers)
  First admin: `pnpm auth:create-admin <id> "<name>"`       → 6-digit code, shown once, valid 7 days
  Admin creates a manager at /admin/users                    → 6-digit code, shown once
  Admin issues a new code (any account, incl. own)           → old code + sessions dead, lock cleared
  Nobody can sign in? `pnpm auth:issue-code <id>`            → same, from the command line
  5 wrong codes in a row                                     → locked until a new code is issued

Web (SSR, today)
  POST /login (ID + code) → session row (client = web, ≤ code expiry) → httpOnly cookie → /

API (CSR / mobile, future)
  POST /api/auth/token    { idNumber, code } → { accessToken (JWT, 10 min), refreshToken }
  any /api/* request      Authorization: Bearer <accessToken>
  POST /api/auth/refresh  (refreshToken) → new pair; old refresh token is dead (rotation)
  POST /api/auth/logout   (refreshToken) → session row deleted

hooks.server.ts
  Bearer header? → verify JWT → load session by `sid`
  else cookie?   → hash token → load session
  → locals.user / locals.session / locals.permissions (same shape for both)
```

---

## Phase A — Database foundation ✅ (`9670709`)

- [x] **A1** Add `@node-rs/argon2` (dependency; native prebuilt works on Vercel).
- [x] **A2** Split schema into `src/lib/server/db/schema/{auth,rbac,audit,index}.ts`; delete the demo `task` table.
- [x] **A3** Point `drizzle.config.ts` at `./src/lib/server/db/schema`.
- [x] **A4** Tables: `role`, `permission`, `role_permission`, `user`, `session`, `login_attempt`, `audit_log`.
- [x] **A5** `src/lib/server/rbac/permissions.ts`: permission keys, role keys, `MANAGEABLE_ROLES`.
- [x] **A6** `drizzle/0000_auth_rbac_audit.sql` generated and reviewed.
- [x] **A7** `drizzle/0001_seed_rbac.sql`: 5 roles (EN/AR names), 11 permission keys, default matrix.
- [x] **A8** `pnpm db:migrate` applied to Neon (5 roles, 11 permissions, 29 matrix rows verified).

**Checkpoint A: PASSED.** Tables and seed verified in Neon; `pnpm check` clean.

## Phase B — Auth core: sessions + JWT (server only) ✅ (`1ec7c21`)

- [x] **B1** Add `jose`; `session.client` enum (`web` / `api`) → `drizzle/0002_session_client.sql`, applied to Neon.
- [x] **B2** `AUTH_JWT_SECRET` in `src/env.ts` (≥ 32 chars, required at runtime) and `.env.example`.
- [x] **B3** `src/lib/server/auth/password.ts`: hash/verify (Argon2id), timing-safe dummy verify.
      (Password generator / rules removed in R.)
- [x] **B4** `src/lib/server/auth/session.ts`: token generation, create/validate/renew/invalidate, cookie helpers.
- [x] **B5** `src/lib/server/auth/jwt.ts`: `signAccessToken()` / `verifyAccessToken()` (HS256, `iss`, `aud`, 10 min, `sub` + `sid`).
- [x] **B6** `src/lib/server/auth/rate-limit.ts`: failure counting from `login_attempt`.
- [x] **B7** `src/lib/server/audit.ts`: `auditInsert()` query builder for `db.batch([...])`.
- [x] **B8** `src/lib/server/rbac/guard.ts`: `requireUser()`, `requirePermission()`.
- [x] **B9** `src/hooks.server.ts`: `handleAuth` (Bearer JWT or cookie) after paraglide.
- [x] **B10** `src/app.d.ts`: typed `App.Locals` (`user`, `session`, `permissions`, `authMethod`).

**Checkpoint B: PASSED.** `pnpm check` 0 errors; a bogus cookie is cleared; a garbage Bearer token and a
signed JWT without a session fall back to logged-out; Argon2id works; `AUTH_JWT_SECRET` set locally and on Vercel.

## Phase C — Credential policy (6-digit codes) + first admin ✅ (`f9cd8f3`)

- [x] **C1** `user`: `password_expires_at`, `failed_login_count`, `locked_at` → migration `0003`.
- [x] **C2** Permission `user.issue_code` → seed migration `0004`; `permissions.ts` key + `MANAGEABLE_ROLES` entry.
- [x] **C3** `src/lib/server/auth/credentials.ts`: `generateCode()` (6 digits), `codeExpiresAt()`, lockout constant (5).
- [x] **C4** `session.ts`: a session never outlives the code (`expires_at` capped, signed out once the code expires).
- [x] **C5** `scripts/create-admin.ts` + `pnpm auth:create-admin` (via `tsx`); refuses when an active admin
      exists (unless `--force`); writes `audit_log`.
- [x] **C6** Migrations `0003` / `0004` applied to Neon (12 permissions, 32 matrix rows).
- [x] **C7** First admin created (ID `1234`).

**Checkpoint C: PASSED.**

## Phase D — Web login, logout ✅ (`e21ff26`)

- [x] **D1** Shared login core (`src/lib/server/auth/login.ts`): rate limit → lookup → locked? → verify →
      code expired? → failure counter / lockout → session. Used by `/login` now and the token API in F.
- [x] **D2** `/login` action: `web` session, cookie, redirect; messages for wrong ID/code, too many
      attempts, locked account, expired code. Login form: 6-digit OTP input.
- [x] ~~**D3** `/change-password`~~ — removed in R (no password changes).
- [x] **D4** `POST /logout` (`src/routes/logout/+server.ts`).
- [x] **D5** All new strings in `messages/en.json` and `messages/ar.json`.

**Checkpoint D: PASSED** (curl, dev + production preview): wrong code length → 400; unknown ID → generic
400; 6th failure → 429; correct secret → 303 with a 12 h `HttpOnly; SameSite=Lax` cookie; logout deletes
the session row; cross-site POST to `/login` / `/logout` → 403 in the production build.

## Phase E — Protect the app area ✅

- [x] **E1** `requireSignedIn()` in `rbac/guard.ts`; `+layout.server.ts` in both `(app)` and `(dashboard)`:
      signed out → `/login`; returns `toSessionUser()` (display fields + permission keys, no secrets).
- [x] **E2** `src/lib/app/layout/UserMenu.svelte` in `Header` and `SiteHeader` (replaces the Login button): name
      (Arabic name under `/ar`), ID, role badge, code expiry in Asia/Damascus time, sign out.

**Checkpoint E: PASSED.** Verified with curl: signed out, `/`, `/dashboard`, `/employees` (and `/ar/…`) → 303 to
`/login` (`/ar/login`); `/employees/__data.json` returns a redirect, not data; `pnpm build` passes.
Signed in, `/` renders with the user's name and `/ar` renders RTL.
`/employees` still uses mock data with no permission check (TODO in its load, until the staff service exists).

## Phase R — Revision: code-only sign-in for admin & managers (2026-10-26) ✅

- [x] **R1** Remove `/change-password` and the `must_change_password` column → migration `0005`, applied to Neon.
- [x] **R2** Every account signs in with a 6-digit code: `login.ts` lockout for all accounts; login form
      and `loginSchema` are code-only (password mode removed).
- [x] **R3** `credentials.ts`: validity presets 24 h / 7 d / 30 d, default 7 d; `credentialKindForRole` removed.
- [x] **R4** `permissions.ts`: `CODE_ROLES` → `EMPLOYEE_ROLES` (dormant employee scopes); admins can issue
      their own code (`user.manage`), managers can't issue for admins / managers.
- [x] **R5** `password.ts`: only hash / verify / dummy verify remain.
- [x] **R6** Scripts: `create-admin` issues a code (`--days 1|7|30`); new `pnpm auth:issue-code <id>` for
      recovery (clears lock, signs out everywhere, audited); shared `scripts/lib.ts`.
- [x] **R7** Messages: removed password-change / mode strings; lockout and expiry now say "ask an administrator".
- [x] **R8** Admin `1234` re-keyed (owner asked for the fixed development code `123456`, valid 7 days,
      audited); replace it with `pnpm auth:issue-code 1234` before real use.

**Checkpoint R: PASSED.** Verified with curl: `/change-password` → 404; a 12-character secret or letters →
400 with the code errors; signed out → `/login` (`/ar/login`); `pnpm check` 0 errors; `pnpm build` passes.
ID `1234` + code → 303 to `/`; logout → 303. The 5-wrong-codes lockout is re-tested at Checkpoint G on a
manager account created there.

## Phase F — Token API for CSR / mobile clients (JWT) ✅

- [x] **F1** `POST /api/auth/token`: `{ idNumber, code }` → `{ tokenType, accessToken, expiresIn, refreshToken,
refreshExpiresAt }` (`session.client = api`), through the same `authenticate()` as `/login` (rate limit,
      lockout, expiry, Arabic-Indic digits). Failure messages shared via `LOGIN_FAILURE` in `login.ts`.
- [x] **F2** `POST /api/auth/refresh`: `{ refreshToken }` → new pair. The old session row is deleted first, so a
      refresh token works once (replay or a concurrent refresh → 401); never past the code's expiry.
- [x] **F3** `POST /api/auth/logout`: `{ refreshToken }` → 204 either way; deletes that `api` session.
- [x] **F4** `GET /api/auth/me`: `{ user, session }` (same `toSessionUser()` shape as the layouts), Bearer or cookie.
- [x] **F5** `src/lib/server/auth/api.ts`: JSON errors `{ code, message }` (stable `code`, localized `message`: `/ar/api/…`
      or the locale cookie), `Cache-Control: no-store` on every response.
- [x] **F6** CORS: none. Same-origin only; cross-origin preflights get no `Access-Control-Allow-Origin`.

**Checkpoint F: PASSED** (curl, dev server): non-JSON / bad code → 400 `invalid_request`; wrong ID → 400 `invalid`;
`١٢٣٤` + code → 200 with tokens (`expiresIn 600`, `refreshExpiresAt` = code expiry); `/me` with Bearer → user, 12
permissions, `client api`; no / forged token → 401; refresh → new pair; replayed refresh → 401; old access JWT after
rotation → 401; logout → 204 and its access JWT → 401; no CORS headers; Arabic messages under `/ar/api`.
Deactivation → 401 is re-tested at Checkpoint G on a manager account.

## Phase G — Account management & code issuing (admin) ✅

- [x] **G1** `src/lib/server/services/users.ts` (actor-based, `user.manage` only): `listAccounts`, `createAccount`
      (admin / operations manager, with a first code), `issueCode` (any account incl. your own; your current
      session survives), `setAccountActive` (deactivation signs out everywhere), `changeAccountRole`. Guards:
      no self-deactivation / self role change, always ≥ 1 active admin, `ACCOUNT_ROLES` only, duplicate ID
      (`23505`) → field error. Audit row in the same `db.batch` as every change.
- [x] **G2** `src/routes/(dashboard)/admin/users/`: accounts table (ID, name, role, status: active / locked / code
      expired / deactivated, code expiry and last sign-in in Damascus time), create / issue-code / change-role
      sheets (open from the inline end, so they mirror in RTL), activate / deactivate; the issued code is shown
      once in a card with copy. "Accounts" sidebar link only for `user.manage` (the route checks it anyway).
- [x] **G3** Admins renew their own code from their own row ("Issue new code").
- [x] **G4** Rate limit counts per-ID failures only since the current code was issued, so a newly issued code
      unlocks a locked-out user at once; a locked account that also hits the rate limit is told it is locked.
- [x] **G5** Shared `formatDateTime()` (`src/lib/utils/datetime.ts`, Asia/Damascus) used by the user menu and the table.

**Checkpoint G: PASSED** (curl, dev server, test account `9000012` "Test Manager", left deactivated): admin
creates it and gets a 6-digit code; duplicate ID → field error; non-account role → error; the manager signs in
with the code, has no Accounts link, and gets 403 on the page and on create / issue-code / deactivate; admin
can't deactivate or re-role themselves; deactivating the manager → web session redirected to `/login`, API
access JWT → 401, sign-in → generic error; reactivated + new code → old code rejected; 5 wrong codes → locked
(`failed_login_count 5`, `locked_at` set); a new code → signed in straight away. Audit rows written for
create, issue_code, activate, deactivate. `pnpm check` 0 errors, `pnpm build` passes.

## Phase H — Hardening & docs ✅

- [x] **H1** Housekeeping rides along with every successful sign-in (same batch): expired sessions and
      `login_attempt` rows older than 30 days are deleted. No cron job needed at this scale.
- [x] **H2** CLAUDE.md §2 (auth CLI), §3 (dates helper), §4 (layout), §7 (auth tables, migrations), §8 (auth
      decided and summarised), §9 (scaffold cleanup done).
- [x] **H3** Security review of the auth surface (below), and the one fix it called for: security headers on
      every response in `hooks.server.ts` (`X-Frame-Options: DENY` + `frame-ancestors 'none'`, `nosniff`,
      `Referrer-Policy`, HSTS outside dev).

### Security review (2026-10-26)

| Area                 | Result                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSRF                 | ✅ Form actions and `/logout`: Kit origin check (403 cross-site in production, verified). `/api/auth/*`: cross-site `text/plain` is also a form type and blocked; JSON needs CORS, none is sent. |
| Sessions / JWT       | ✅ Only token hashes stored; cookie `httpOnly`, `Secure` in prod, `SameSite=Lax`; HS256 pinned with `iss` / `aud` / `exp`; every request re-loads the session; refresh tokens single-use.        |
| Secrets              | ✅ Codes, tokens and hashes never reach logs, `audit_log`, layout data or the accounts list (explicit column selection).                                                                         |
| Enumeration / timing | ✅ Unknown / inactive IDs: generic message + dummy Argon2. ⚠ "Locked" reveals that an ID exists and is locked (accepted: it tells the real user what to do).                                     |
| Brute force          | ✅ 6 digits + lockout after 5 → ≤ 5 guesses per issued code. ⚠ Anyone who knows an ID can lock it (recovery: `pnpm auth:issue-code`). ⚠ A shared airport NAT shares the 20-per-IP budget.        |
| Clickjacking         | ✅ Fixed in H3 (framing denied everywhere).                                                                                                                                                      |
| Open items           | ⚠ Admin `1234` uses the development code `123456` → re-issue before real use. ⚠ `/employees` has no permission check yet (mock data, TODO until the staff service exists).                       |

**Checkpoint H: PASSED.** Production preview: HSTS + framing headers present; admin signs in → 303 `/`;
`/admin/users` and `/ar/admin/users` (RTL) render; cross-site POST to an account action → 403; logout → 303.
`pnpm check` 0 errors (1 old warning in `stepper-item.svelte`), `pnpm build` passes, Prettier and ESLint clean
on all auth files. Project-wide `pnpm lint` still reports pre-existing issues in generated shadcn files
(`chart-tooltip.svelte` and unformatted `ui/` components), not touched here.

## Later (only if employees get access)

- [ ] **L1** Create an account from a `staff` record (`login_id = employee_no`, link `staff.user_id`).
- [ ] **L2** Deactivating a staff member deactivates their user account.
- [ ] **L3** Managers / supervisors issue codes for employees (`user.issue_code`, team-scoped once teams exist).
