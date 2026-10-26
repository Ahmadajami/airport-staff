# Auth plan: employee-ID login, one-time passwords, sessions + JWT

Tracking file for the auth work (CLAUDE.md §8). Each step has an ID (`B4`, `F2`, …) so commits and
reviews can point at it. Tick a step when it has landed. Start the next phase only after the
previous checkpoint is verified.

**Status:** Phase A ✅ · Phase B 🚧 · C–H ⏳

## Decisions

| Topic           | Decision                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login           | Employee **ID number** + password, for every role (Admin and Operations Manager included). No email login, no public sign-up.                                                                            |
| Passwords       | Admin/Manager creates the account → server generates a **random one-time password**, shown once to the issuer. Must be changed at first sign-in. Argon2id (`@node-rs/argon2`).                           |
| Who manages     | **Admin**: every account (incl. admins & managers). **Operations Manager**: supervisor, dispatcher and viewer accounts only.                                                                             |
| Source of truth | A row in `session`. Every way of authenticating resolves to a session, so deactivation, password reset and role change revoke access **immediately** for both web and API clients.                       |
| Web (SSR)       | `httpOnly` cookie with a random token; DB stores only its SHA-256. 12 h sliding expiry.                                                                                                                  |
| API (CSR/JWT)   | For a future CSR/mobile client: short-lived **access JWT** (HS256, `jose`, 10 min, `Authorization: Bearer`) + opaque **refresh token** (7 days, rotated on every use, stored hashed as a `session` row). |
| JWT checks      | Signature, `iss`, `aud`, `exp`, then the `sid` claim must point at a live session of an active user. A JWT alone is never trusted for authorisation; permissions are always loaded from the DB.          |
| Temp password   | While `must_change_password` is set, every permission check fails (web and API); only change-password and logout work.                                                                                   |
| Brute force     | ≥ 5 failures per ID or ≥ 20 per IP in 15 min → temporarily blocked. Shared by web login and the token API.                                                                                               |
| Permission seed | Proposed default matrix below. Still an open question with the ops team (CLAUDE.md §10), so it lives in the DB.                                                                                          |

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
| `settings.manage`         |   ✓   |                    |            |            |        |
| `audit.read`              |   ✓   |         ✓          |            |            |        |

`user.manage` can manage every role. `user.manage_operational` can only manage `supervisor`,
`dispatcher` and `viewer` accounts, and can't move anyone into or out of `admin` / `operations_manager`.

## Flows

```
Account creation
  Admin/Manager creates account (ID, name, role)
    └─ server generates one-time password → shown once → handed to the employee

Web (SSR, today)
  POST /login (ID + password) → session row (client = web) → httpOnly cookie
    └─ must_change_password → /change-password → app

API (CSR / mobile, future)
  POST /api/auth/token    (ID + password)   → { accessToken (JWT, 10 min), refreshToken (7 d) }
  any /api/* request      Authorization: Bearer <accessToken>
  POST /api/auth/refresh  (refreshToken)    → new pair; old refresh token is dead (rotation)
  POST /api/auth/password (current + new)   → clears must_change_password
  POST /api/auth/logout   (refreshToken)    → session row deleted

hooks.server.ts
  Bearer header? → verify JWT → load session by `sid`
  else cookie?   → hash token → load session
  → locals.user / locals.session / locals.permissions (same shape for both)
```

---

## Phase A — Database foundation ✅

- [x] **A1** Add `@node-rs/argon2` (dependency; native prebuilt works on Vercel).
- [x] **A2** Split schema into `src/lib/server/db/schema/{auth,rbac,audit,index}.ts`; delete the demo `task` table.
- [x] **A3** Point `drizzle.config.ts` at `./src/lib/server/db/schema`.
- [x] **A4** Tables: `role`, `permission`, `role_permission`, `user`, `session`, `login_attempt`, `audit_log`.
- [x] **A5** `src/lib/server/rbac/permissions.ts`: permission keys, role keys, `MANAGEABLE_ROLES`.
- [x] **A6** `drizzle/0000_auth_rbac_audit.sql` generated and reviewed.
- [x] **A7** `drizzle/0001_seed_rbac.sql`: 5 roles (EN/AR names), 11 permission keys, default matrix.
- [x] **A8** `pnpm db:migrate` applied to Neon (5 roles, 11 permissions, 29 matrix rows verified).

**Checkpoint A: PASSED.** Tables and seed verified in Neon; `pnpm check` clean.

## Phase B — Auth core: sessions + JWT (server only) 🚧

- [x] **B1** Add `jose`; `session.client` enum (`web` / `api`) → `drizzle/0002_session_client.sql`, applied to Neon.
- [x] **B2** `AUTH_JWT_SECRET` in `src/env.ts` (≥ 32 chars, validated at startup) and `.env.example`.
- [x] **B3** `src/lib/server/auth/password.ts`: hash/verify (Argon2id), timing-safe dummy verify, `generateTempPassword()`, `passwordProblems()`.
- [x] **B4** `src/lib/server/auth/session.ts`: token generation, create/validate/renew/invalidate, cookie helpers.
- [x] **B5** `src/lib/server/auth/jwt.ts`: `signAccessToken()` / `verifyAccessToken()` (HS256, `iss`, `aud`, 10 min, `sub` + `sid`).
- [x] **B6** `src/lib/server/auth/rate-limit.ts`: failure counting from `login_attempt`.
- [x] **B7** `src/lib/server/audit.ts`: `auditInsert()` query builder for `db.batch([...])`.
- [x] **B8** `src/lib/server/rbac/guard.ts`: `requireUser()`, `requirePermission()` (blocks while `must_change_password`).
- [x] **B9** `src/hooks.server.ts`: `handleAuth` (Bearer JWT or cookie) after paraglide.
- [x] **B10** `src/app.d.ts`: typed `App.Locals` (`user`, `session`, `permissions`, `authMethod`).

**Checkpoint B:** `pnpm check` clean; app renders logged out; `AUTH_JWT_SECRET` set locally and on Vercel.
Verified so far: `pnpm check` 0 errors; dev server returns 200 when logged out (`/`, `/ar`, `/login`); a bogus cookie is cleared (`Set-Cookie: session=; Max-Age=0`); a garbage Bearer token and a validly signed JWT with no matching session both fall back to logged-out; Argon2id hash/verify and the one-time password generator work. **Remaining:** set `AUTH_JWT_SECRET` in `.env` and in Vercel (Production + Preview).

## Phase C — First admin bootstrap ⏳

- [ ] **C1** `scripts/create-admin.ts` + `pnpm auth:create-admin <loginId> "<full name>"`.
- [ ] **C2** Refuses when an active admin exists (unless `--force`); prints the one-time password once; writes `audit_log`.

**Checkpoint C:** admin row exists with `must_change_password = true`.

## Phase D — Web login, forced password change, logout ⏳

- [ ] **D1** `/login` action: rate limit → lookup → verify → session (`web`) → cookie → redirect.
- [ ] **D2** `/change-password`: current + new + confirm; revokes the user's other sessions; audited.
- [ ] **D3** `/logout` POST action.
- [ ] **D4** All new strings in `messages/en.json` and `messages/ar.json`.

**Checkpoint D:** admin signs in → forced password change → app home; 6 wrong attempts → blocked;
same flow under `/ar` (RTL).

## Phase E — Protect the app area ⏳

- [ ] **E1** `src/routes/(app)/+layout.server.ts`: require session, redirect while `must_change_password`.
- [ ] **E2** Header: user name, role badge, logout.

**Checkpoint E:** logged-out visit to `/` or `/ar` → login page; logout deletes the session row.

## Phase F — Token API for CSR / mobile clients (JWT) ⏳

- [ ] **F1** Shared login core (`src/lib/server/auth/login.ts`) used by both `/login` and the token API.
- [ ] **F2** `POST /api/auth/token`: ID + password → access JWT + refresh token (`session.client = api`).
- [ ] **F3** `POST /api/auth/refresh`: rotate refresh token (new session row + delete old in one batch).
- [ ] **F4** `POST /api/auth/password` and `POST /api/auth/logout`.
- [ ] **F5** `GET /api/auth/me`: user, role, permissions (what a CSR client needs to render).
- [ ] **F6** JSON error shape (`{ code, message }`), localized via `Accept-Language`; `Cache-Control: no-store`.
- [ ] **F7** CORS: same-origin only for now; allow-list env var only if a separate client origin appears.

**Checkpoint F:** curl flow works: token → `/api/auth/me` with Bearer → refresh → old refresh token
rejected → deactivated user's access JWT rejected on the next request.

## Phase G — Account management (Admin & Operations Manager) ⏳

- [ ] **G1** `src/lib/server/services/users.ts`: list, create, reset password, activate/deactivate, change role
      (permission + `MANAGEABLE_ROLES` checks, last-admin and self-deactivation guards, audit in the same batch,
      sessions revoked in the same batch).
- [ ] **G2** `src/routes/(app)/admin/users/`: table, create sheet, row actions, one-time password shown once.

**Checkpoint G:** admin creates a manager; manager creates a dispatcher; manager trying to create or
reset an admin → 403; viewer posting any action → 403; deactivated user is signed out on the next request
(web and API).

## Phase H — Hardening & docs ⏳

- [ ] **H1** Clean up expired sessions and old login attempts opportunistically.
- [ ] **H2** Update CLAUDE.md §4, §8, §9.
- [ ] **H3** Security review of the auth diff.

**Checkpoint H:** full flow re-tested in EN and AR (web) and via curl (API); `pnpm check` and `pnpm lint` clean.

## Later (blocked on the workforce tables)

- [ ] **L1** Create an account from a `staff` record (`login_id = employee_no`, link `staff.user_id`).
- [ ] **L2** Deactivating a staff member deactivates their user account.
