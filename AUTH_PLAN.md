# Auth plan: employee-ID login, issued 6-digit codes, sessions + JWT

Tracking file for the auth work (CLAUDE.md §8). Each step has an ID (`B4`, `F2`, …) so commits and
reviews can point at it. Tick a step when it has landed. Start the next phase only after the
previous checkpoint is verified.

**Status:** A ✅ · B ✅ · C 🚧 · D–H ⏳

## Decisions

| Topic            | Decision                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login            | Employee **ID number** + secret, for every role. No email login, no public sign-up.                                                                                                                      |
| Employee secret  | `supervisor`, `dispatcher`, `viewer`: a **6-digit code** issued by an Admin / Operations Manager / Supervisor. Valid **24 h** by default, many sign-ins. **Employees can never change it themselves.**   |
| Code expiry      | A session never outlives its code: when the code expires the employee is signed out and needs a new code. Issuing a new code kills the old code and the employee's sessions.                             |
| Lockout          | Code accounts: **5 consecutive wrong codes → locked** until a new code is issued. Active sessions are kept (a guesser can't kick someone mid-shift).                                                     |
| Staff secret     | `admin`, `operations_manager`: long password. Created with a random one-time password (shown once), **must be changed at first sign-in**, can be changed later. No lockout (only the rate limit).        |
| Who issues codes | **Admin**: anyone. **Operations Manager** and **Supervisor**: supervisor / dispatcher / viewer accounts, never their own. (Supervisors limited to their own team once teams exist.)                      |
| Who manages      | Create / deactivate / change role: **Admin** for every account; **Operations Manager** for supervisor / dispatcher / viewer. Supervisors only issue codes.                                               |
| Source of truth  | A row in `session`. Every way of authenticating resolves to a session, so deactivation, new codes and role changes revoke access **immediately** for both web and API clients.                           |
| Web (SSR)        | `httpOnly` cookie with a random token; DB stores only its SHA-256. 12 h sliding expiry, capped at the code's expiry.                                                                                     |
| API (CSR/JWT)    | For a future CSR/mobile client: short-lived **access JWT** (HS256, `jose`, 10 min, `Authorization: Bearer`) + opaque **refresh token** (7 days, rotated on every use, stored hashed as a `session` row). |
| JWT checks       | Signature, `iss`, `aud`, `exp`, then the `sid` claim must point at a live session of an active user. A JWT alone is never trusted for authorisation; permissions are always loaded from the DB.          |
| Temp password    | Admin / manager only: while `must_change_password` is set, every permission check fails; only change-password and logout work.                                                                           |
| Brute force      | All accounts: ≥ 5 failures per ID or ≥ 20 per IP in 15 min → temporarily blocked. Plus the code-account lockout above.                                                                                   |
| Hashing          | Argon2id (`@node-rs/argon2`) for both passwords and codes. Codes are shown once to the issuer and never stored in plain text.                                                                            |
| Permission seed  | Proposed default matrix below. Still an open question with the ops team (CLAUDE.md §10), so it lives in the DB.                                                                                          |

Open with the ops team: default code validity (24 h now; 12 / 24 / 72 h selectable when issuing), and
whether codes should follow shift times once shifts exist (Phase 3).

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

- `user.manage`: every role.
- `user.manage_operational`: create / deactivate / change role for `supervisor`, `dispatcher`, `viewer` only.
- `user.issue_code`: issue a 6-digit code for `supervisor`, `dispatcher`, `viewer` accounts other than your own
  (admins issue for any code account through `user.manage`).

## Flows

```
Employee (supervisor / dispatcher / viewer)
  Admin / Manager creates the account (ID, name, role)          → first 6-digit code, shown once
  Admin / Manager / Supervisor issues a code whenever needed      → new code, old code + sessions dead
  Employee signs in with ID + code                                → session ends at code expiry (≤ 12 h sliding)
  5 wrong codes in a row                                          → locked until a new code is issued

Admin / Operations Manager
  Created by an Admin (first admin: `pnpm auth:create-admin`)    → random one-time password, shown once
  First sign-in                                                   → forced to /change-password → app

Web (SSR, today)
  POST /login (ID + code/password) → session row (client = web) → httpOnly cookie

API (CSR / mobile, future)
  POST /api/auth/token    (ID + code/password) → { accessToken (JWT, 10 min), refreshToken }
  any /api/* request      Authorization: Bearer <accessToken>
  POST /api/auth/refresh  (refreshToken)       → new pair; old refresh token is dead (rotation)
  POST /api/auth/password (admin / manager)    → clears must_change_password
  POST /api/auth/logout   (refreshToken)       → session row deleted

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
- [x] **B3** `src/lib/server/auth/password.ts`: hash/verify (Argon2id), timing-safe dummy verify, `generateTempPassword()`, `passwordProblems()`.
- [x] **B4** `src/lib/server/auth/session.ts`: token generation, create/validate/renew/invalidate, cookie helpers.
- [x] **B5** `src/lib/server/auth/jwt.ts`: `signAccessToken()` / `verifyAccessToken()` (HS256, `iss`, `aud`, 10 min, `sub` + `sid`).
- [x] **B6** `src/lib/server/auth/rate-limit.ts`: failure counting from `login_attempt`.
- [x] **B7** `src/lib/server/audit.ts`: `auditInsert()` query builder for `db.batch([...])`.
- [x] **B8** `src/lib/server/rbac/guard.ts`: `requireUser()`, `requirePermission()` (blocks while `must_change_password`).
- [x] **B9** `src/hooks.server.ts`: `handleAuth` (Bearer JWT or cookie) after paraglide.
- [x] **B10** `src/app.d.ts`: typed `App.Locals` (`user`, `session`, `permissions`, `authMethod`).

**Checkpoint B: PASSED.** `pnpm check` 0 errors; logged-out pages return 200 (`/`, `/ar`, `/login`); a bogus
cookie is cleared; a garbage Bearer token and a signed JWT without a session fall back to logged-out;
Argon2id and the one-time password generator work; `AUTH_JWT_SECRET` set locally and on Vercel.

## Phase C — Credential policy (6-digit codes) + first admin 🚧

- [x] **C1** `user`: `password_expires_at`, `failed_login_count`, `locked_at` → migration `0003`.
- [x] **C2** Permission `user.issue_code` (admin, operations_manager, supervisor) → seed migration `0004`;
      `permissions.ts`: key + `MANAGEABLE_ROLES['user.issue_code']`.
- [x] **C3** `src/lib/server/auth/credentials.ts`: `credentialKindForRole()` (`code` / `password`),
      `generateCode()` (6 digits), `codeExpiresAt()` (default 24 h), lockout constant (5).
- [x] **C4** `session.ts`: a session never outlives the code (`expires_at` capped, signed out once the code
      expires); `AuthUser` gets `credential` and `credentialExpiresAt`.
- [x] **C5** `scripts/create-admin.ts` + `pnpm auth:create-admin <loginId> "<full name>"` (via `tsx`).
      Refuses when an active admin exists (unless `--force`); prints the one-time password once; writes `audit_log`.
- [x] **C6** Migrations `0003` / `0004` applied to Neon (12 permissions, 32 matrix rows; `user.issue_code` → admin, operations_manager, supervisor).
- [ ] **C7** First admin created with `pnpm auth:create-admin` (run by the project owner, so the one-time password never leaves their terminal).

**Checkpoint C:** `user.issue_code` granted to 3 roles in Neon; admin row exists with
`must_change_password = true` and no `password_expires_at`; `pnpm check` clean.

## Phase D — Web login, password change (admin / manager), logout ⏳

- [ ] **D1** Shared login core (`src/lib/server/auth/login.ts`): rate limit → lookup → locked? → verify →
      code expired? → failure counter / lockout → session. Used by `/login` now and the token API in F.
- [ ] **D2** `/login` action: create `web` session, cookie, redirect (`/change-password` or `/`). Messages for
      wrong ID/secret, too many attempts, locked account, expired code.
- [ ] **D3** `/change-password` (admin / manager only; 404 for code accounts): current + new + confirm;
      revokes the user's other sessions; audited.
- [ ] **D4** `/logout` POST action.
- [ ] **D5** All new strings in `messages/en.json` and `messages/ar.json`.

**Checkpoint D:** admin signs in → forced password change → app home; a code account signs in with its code;
expired code → "ask your supervisor"; 5 wrong codes → locked; same flow under `/ar` (RTL).

## Phase E — Protect the app area ⏳

- [ ] **E1** `src/routes/(app)/+layout.server.ts`: require session, redirect while `must_change_password`.
- [ ] **E2** Header: user name, role badge, code expiry for employees, logout.

**Checkpoint E:** logged-out visit to `/` or `/ar` → login page; logout deletes the session row.

## Phase F — Token API for CSR / mobile clients (JWT) ⏳

- [ ] **F1** `POST /api/auth/token`: ID + code/password → access JWT + refresh token (`session.client = api`), via the D1 core.
- [ ] **F2** `POST /api/auth/refresh`: rotate refresh token (new session row + delete old in one batch); never past code expiry.
- [ ] **F3** `POST /api/auth/password` (admin / manager) and `POST /api/auth/logout`.
- [ ] **F4** `GET /api/auth/me`: user, role, permissions, code expiry (what a CSR client needs to render).
- [ ] **F5** JSON error shape (`{ code, message }`), localized via `Accept-Language`; `Cache-Control: no-store`.
- [ ] **F6** CORS: same-origin only for now; allow-list env var only if a separate client origin appears.

**Checkpoint F:** curl flow works: token → `/api/auth/me` with Bearer → refresh → old refresh token
rejected → deactivated user's access JWT rejected on the next request.

## Phase G — Account management & code issuing ⏳

- [ ] **G1** `src/lib/server/services/users.ts`: list, create, issue code, reset admin/manager password,
      activate/deactivate, change role. Permission + `MANAGEABLE_ROLES` checks, no self-issue, last-admin and
      self-deactivation guards; audit and session revocation in the same batch. Role change between
      `code` and `password` roles issues the matching new credential.
- [ ] **G2** `src/routes/(app)/admin/users/`: table, create sheet, row actions; issued code / one-time
      password shown once with its expiry.
- [ ] **G3** Supervisor view: issue codes for supervisor / dispatcher / viewer accounts (team-scoped once teams exist).

**Checkpoint G:** admin creates a manager; manager creates a dispatcher; supervisor issues a dispatcher code
and the dispatcher's old code stops working; supervisor issuing for an admin or for themself → 403; viewer
posting any action → 403; deactivated user is signed out on the next request (web and API).

## Phase H — Hardening & docs ⏳

- [ ] **H1** Clean up expired sessions and old login attempts opportunistically.
- [ ] **H2** Update CLAUDE.md §4, §8, §9.
- [ ] **H3** Security review of the auth diff.

**Checkpoint H:** full flow re-tested in EN and AR (web) and via curl (API); `pnpm check` and `pnpm lint` clean.

## Later (blocked on the workforce tables)

- [ ] **L1** Create an account from a `staff` record (`login_id = employee_no`, link `staff.user_id`).
- [ ] **L2** Deactivating a staff member deactivates their user account.
- [ ] **L3** Supervisors issue codes only for staff in their own team.
