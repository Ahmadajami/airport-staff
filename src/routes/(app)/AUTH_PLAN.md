# Auth plan — employee-ID login with admin-issued one-time passwords

Tracking file for the auth work (CLAUDE.md §8). Tick a box when the step has landed, and only
start the next phase after its checkpoint has been verified.

## Decisions

| Topic           | Decision                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Login           | Employee **ID number** + password, for every role (Admin and Operations Manager included). No email login, no public sign-up.              |
| Passwords       | Admin/Manager creates the account → server generates a **random one-time password**, shown once to the issuer. Changed at first sign-in.   |
| Implementation  | Hand-rolled sessions in Postgres (Drizzle, neon-http), Argon2id hashing (`@node-rs/argon2`), tokens/hashes from `node:crypto`.             |
| Who manages     | **Admin**: every account (incl. admins & managers). **Operations Manager**: supervisor, dispatcher and viewer accounts only.               |
| Session         | `httpOnly` cookie holds a random token; DB stores only its SHA-256. 12 h sliding expiry. Deactivation, reset, role change revoke sessions. |
| Brute force     | ≥ 5 failures per ID or ≥ 20 per IP in 15 min → temporarily blocked.                                                                        |
| Permission seed | Proposed default matrix below. Still an open question with the ops team (CLAUDE.md §10), so it lives in the DB.                            |

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

## Flow

```
Admin/Manager creates account (ID, name, role)
  └─ server generates one-time password → shown once → handed to the employee
Employee signs in with ID + one-time password
  └─ must_change_password = true → forced to /change-password → sets own password
  └─ lands in the app; every load/action re-checks permissions on the server
Admin/Manager can reset (new one-time password), change role, deactivate
  └─ each revokes the target's sessions immediately and writes audit_log
```

---

## Phase A — Database foundation

- [x] Add `@node-rs/argon2` (dependency; native prebuilt works on Vercel).
- [x] Split schema into `src/lib/server/db/schema/{auth,rbac,audit,index}.ts`; delete the demo `task` table.
- [x] Point `drizzle.config.ts` at `./src/lib/server/db/schema`.
- [x] Tables: `role`, `permission`, `role_permission`, `user`, `session`, `login_attempt`, `audit_log`.
- [x] `src/lib/server/rbac/permissions.ts`: permission keys, role keys, `MANAGEABLE_ROLES`.
- [x] `pnpm db:generate` → review SQL (`drizzle/0000_auth_rbac_audit.sql`).
- [x] Custom migration `seed_rbac` (`drizzle/0001_seed_rbac.sql`): 5 roles (EN/AR names), all permission keys, default matrix.
- [ ] `pnpm db:migrate` (only after the user approves running it against Neon).

**✅ Checkpoint A** — migration SQL reviewed and applied; Drizzle Studio shows 5 roles, 11 permissions
and the matrix above; `pnpm check` and `pnpm lint` clean.

## Phase B — Auth core (server only)

- [ ] `src/lib/server/auth/password.ts`: hash/verify (Argon2id), `generateTempPassword()`, `validateNewPassword()`.
- [ ] `src/lib/server/auth/session.ts`: token generation, create/validate/renew/invalidate, cookie helpers.
- [ ] `src/lib/server/auth/rate-limit.ts`: failure counting from `login_attempt`.
- [ ] `src/lib/server/audit.ts`: `auditInsert()` query builder for `db.batch([...])`.
- [ ] `src/lib/server/rbac/guard.ts`: `requireUser()`, `requirePermission()`.
- [ ] `src/hooks.server.ts`: `handleAuth` after paraglide; `src/app.d.ts`: typed `App.Locals`.

**✅ Checkpoint B** — `pnpm check` / `pnpm lint` clean; the app still renders when logged out.

## Phase C — First admin bootstrap

- [ ] `scripts/create-admin.ts` + `pnpm auth:create-admin <loginId> "<full name>"`.
- [ ] Refuses when an active admin exists (unless `--force`); prints the one-time password once; writes `audit_log`.

**✅ Checkpoint C** — admin row exists with `must_change_password = true`.

## Phase D — Login, forced password change, logout

- [ ] `/login` action: rate limit → lookup → verify → session → redirect (`/change-password` or `/`).
- [ ] `/change-password`: current + new + confirm; revokes the user's other sessions; audited.
- [ ] `/logout` POST action.
- [ ] All new strings in `messages/en.json` and `messages/ar.json`.

**✅ Checkpoint D** — admin signs in → forced password change → app home; 6 wrong attempts → blocked;
same flow works under `/ar` (RTL).

## Phase E — Protect the app area

- [ ] `src/routes/(app)/+layout.server.ts`: require session, redirect while `must_change_password`.
- [ ] Header: user name, role badge, logout.

**✅ Checkpoint E** — logged-out visit to `/` or `/ar` → login page; logout deletes the session row.

## Phase F — Account management (Admin & Operations Manager)

- [ ] `src/lib/server/services/users.ts`: list, create, reset password, activate/deactivate, change role
      (permission + `MANAGEABLE_ROLES` checks, last-admin and self-deactivation guards, audit in the same batch).
- [ ] `src/routes/(app)/admin/users/`: table, create sheet, row actions, one-time password shown once.

**✅ Checkpoint F** — admin creates a manager; manager creates a dispatcher; manager trying to create or
reset an admin → 403; viewer posting any action → 403; deactivated user is signed out on the next request.

## Phase G — Hardening & docs

- [ ] Clean up expired sessions and old login attempts opportunistically.
- [ ] Update CLAUDE.md §4, §8, §9.
- [ ] Security review of the auth diff.

**✅ Checkpoint G** — full flow re-tested in EN and AR; `pnpm check` and `pnpm lint` clean.

## Later (blocked on the workforce tables)

- [ ] Create an account from a `staff` record (`login_id = employee_no`, link `staff.user_id`).
- [ ] Deactivating a staff member deactivates their user account.
