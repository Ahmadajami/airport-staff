# Operations plan: teams, employees, flights, imports, flight report

Tracking file for the operational core (CLAUDE.md Phases 1–2). Each step has an ID (`A3`, `D2`, …) so
commits and reviews can point at it. Tick a step when it has landed. Start the next phase only after the
previous checkpoint is verified, and commit once per phase.

**Status:** A ✅ · B, C partly verified (team / staff flows pass; rename, deactivate, Arabic still to run)
· **D (upload & import) built but NOT TESTED: paused until the team shift & supervisor work
(`ROSTER_PLAN.md`) lands** · E in progress (E1, E2, E4 built, ticked once Checkpoint E passes) · **X in
progress** (X1–X6, X11, X12, X16 done; X13 / X14 done for the flight sheet) · F–H ⏳

**Released (2026-10-26):** everything above (A–E as built, the SvelteKit 3 error handling, X1–X6, X11–X13
for the flight sheet, X16, the no-team employee hotfix, migrations `0006`–`0009`) is commit `14d38ac`,
merged to `main` through PR #1 (merge commit `8b98ca2`) for the staging check. Migrations `0008` / `0009`
were applied to the `.env` Neon database before the merge. Later work branches from the updated `main`.

## Goal

- **Teams CRUD**: create, name (English + Arabic), rename, deactivate teams.
- **Employees** in the database, added by hand or **imported from `.xlsx` or a Markdown table**.
- **Flights**, entered by hand or imported the same way, each with an **image link** shown on the report.
- **Every flight gets a team.** A team can work many flights a day, never two overlapping ones.
- **Flight report** with Qatar-Airways-style cards: image, flight number, route, times, status, team.

Users: the admin and operations managers. Both already hold `staff.write`, `flight.write`,
`assignment.write`, `import.run`, `flight.read` and `report.read` in the seeded permission matrix.
Employees still don't sign in.

## Decisions

| Topic             | Decision                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff ↔ team      | A staff member belongs to **at most one team** (`staff.team_id`).                                                                                                                                                                          |
| Team ↔ flight     | Assignments are per **team** (`team_flight_assignment`), one active team per flight. Because a person is in one team, "a team never overlaps" also means "a person never overlaps".                                                        |
| No double-booking | Postgres **exclusion constraint** on a team's active assignment windows (CLAUDE.md §6.2). The app pre-checks for a friendly message; SQLSTATE `23P01` maps to a localized conflict error.                                                  |
| Uncovered flight  | A non-cancelled flight with no active team assignment. Highlighted on the flights table and the report.                                                                                                                                    |
| Handling window   | Per flight `handling_starts_at` / `handling_ends_at`, prefilled from `DEFAULT_HANDLING_MINUTES` (arrival −30 / +60 min, departure −90 / +15 min). **Provisional**: open question in CLAUDE.md §10. Editable per flight; overrides audited. |
| Image link        | Optional `flight.image_url`, `https://` only, shown as `<img loading="lazy" referrerpolicy="no-referrer">` with the airline code as fallback text. Nothing special: just a link (e.g. the airline logo).                                   |
| No hard deletes   | Teams → `active = false` (blocked while they have future active assignments; members are unassigned). Staff → `active = false`. Flights → `status = 'cancelled'` (cancels their assignment). Assignments → `status = 'cancelled'`.         |
| Import flow       | Upload → server parses → rows stored in `import_batch` / `import_row` → preview with per-row errors and create / update / skip → confirm → one `db.batch` upsert + audit. Max **2 MB / 2 000 rows**.                                       |
| Import keys       | Staff: `employee_no`. Flights: (`airline_code`, `flight_no`, Damascus date of `scheduled_at`).                                                                                                                                             |
| Column mapping    | One file, `src/lib/server/imports/columns.ts`: field → header aliases for our template, typical **Odoo** exports and Arabic headers. Adapting to a real Odoo file means editing only that file.                                            |
| Libraries         | `read-excel-file` (parse `.xlsx`, server only) and `write-excel-file` (template download). Markdown tables: small in-house GFM table parser, no dependency.                                                                                |
| Time              | Stored as `timestamptz` (UTC); entered and shown in Asia/Damascus (`@internationalized/date`, `formatDateTime`).                                                                                                                           |

### Import columns (defaults, edit in `columns.ts`)

| Field          | Template header | Odoo-style aliases                    | Arabic aliases |
| -------------- | --------------- | ------------------------------------- | -------------- |
| `employee_no`  | `employee_no`   | Badge ID, Barcode, Employee ID        | الرقم الوظيفي  |
| `full_name`    | `full_name`     | Employee Name, Name                   | الاسم          |
| `full_name_ar` | `full_name_ar`  | Arabic Name                           | الاسم بالعربية |
| `phone`        | `phone`         | Work Mobile, Mobile Phone, Work Phone | الهاتف، الجوال |
| `function`     | `function`      | Job Position, Job Title, Department   | الوظيفة، القسم |
| `team`         | `team`          | Team                                  | الفريق         |

Flights: `airline_code`, `flight_no`, `direction` (`arrival` / `departure`, or `A` / `D`), `origin`,
`destination`, `scheduled_at` (Damascus date + time), `aircraft_type`, `stand`, `gate`, `image_url`,
optional `team`.

---

## Phase A — Schema & migrations ✅

- [x] **A1** `src/lib/server/db/schema/workforce.ts`: `staff_function` (key, name_en, name_ar), `team`
      (name_en unique, name_ar, active, timestamps), `staff` (employee_no unique digits, full_name,
      full_name_ar, phone, function_id, team_id, active, odoo_id unique nullable, timestamps).
- [x] **A2** `flights.ts`: enums `flight_direction`, `flight_status`, `flight_source`; `flight` per CLAUDE.md
      §7 plus `image_url`; unique (`source`, `external_ref`); index `scheduled_at`.
- [x] **A3** `assignments.ts`: `team_flight_assignment` (team_id, flight_id, starts_at, ends_at, status
      `assigned` / `cancelled`, assigned_by, override_reason, timestamps); partial unique (`flight_id`)
      where active.
- [x] **A4** `imports.ts`: `import_batch`, `import_row` per CLAUDE.md §7.
- [x] **A5** Relations, `$inferSelect` / `$inferInsert` types, `schema/index.ts` re-exports.
- [x] **A6** `pnpm db:generate` → review SQL.
- [x] **A7** Custom migrations: `btree_gist` + `EXCLUDE USING gist (team_id WITH =, tstzrange(starts_at,
ends_at, '[)') WITH &&) WHERE (status <> 'cancelled')`; seed `staff_function` (ramp, baggage, check_in,
      gate, with the EN / AR names from today's labels).
- [x] **A8** `pnpm db:migrate`.

**Checkpoint A:** SQL reviewed and applied; two overlapping active assignments for one team fail with
`23P01` (manual SQL check); `pnpm check` clean.

> **Result (2026-10-26) ✅** Migrations 0000–0007 applied. In a rolled-back transaction: back-to-back
> windows insert; an overlapping active window fails `23P01` (`team_flight_assignment_no_overlap`); the
> same overlap with `status = 'cancelled'` inserts; a second active team on one flight fails `23505`
> (`team_flight_assignment_active_flight_unique`). `btree_gist`, window / digits `CHECK`s and the 4
> `staff_function` seeds present. `pnpm check` clean.

## Phase B — Teams CRUD ⏳ checkpoint pending

- [x] **B1** `src/lib/server/services/teams.ts` (Actor pattern from `services/users.ts`): list (member count,
      today's flights), create, rename, deactivate / reactivate; `staff.write`; audit in the same batch;
      duplicate name (`23505`) → field error.
- [x] **B2** `src/routes/(dashboard)/teams/`: table + create / rename sheets (reuse the patterns of
      `admin/users/CreateAccountSheet.svelte` and `labels.ts#endSide`).
- [x] **B3** Sidebar link in `src/lib/app/layout/nav.ts` with `permission: 'staff.write'`.
- [x] **B4** EN + AR messages.

**Checkpoint B:** create / rename / deactivate in EN and AR; duplicate name rejected; a request without
`staff.write` → 403.

> **Result (2026-10-26) ⏳ partial.** Before the owner's run the DB had no `team` rows and no `team.*`
> audit actions (never run). Owner's run, checked in the DB: 2 teams created, each with a `team.create`
> audit row; duplicate name rejected (owner-reported, failed inserts write nothing to check). **Still to
> run:** rename (no `team.rename` yet), deactivate + reactivate (no `team.deactivate` / `team.activate`),
> the same in Arabic. The 403 item can't be run from the UI: only `admin` / `operations_manager` hold
> accounts and both have `staff.write`; covered by the review (every load and action calls
> `requirePermission`).

## Phase C — Employees on the database ⏳ checkpoint pending

- [x] **C1** `services/staff.ts`: list (with team + function), create, update, set team, deactivate.
- [x] **C2** `/employees` loads from the DB; delete the mock `data.ts`; `requirePermission` on load and
      actions (removes today's TODO).
- [x] **C3** Drag-and-drop persists through a `?/setTeam` action (optimistic UI, revert + toast on failure).
- [x] **C4** Add / edit employee sheet; deactivate.

**Checkpoint C:** team moves survive a reload; audit rows written; EN + AR.

> **Result (2026-10-26) ⏳ partial.** Before the owner's run the DB had no `staff` rows and no `staff.*`
> audit actions (never run). **Bug found and fixed in the run:** creating an employee with no team failed,
> because the team select posted its `none` placeholder, which the server's `'' | uuid` schema rejects;
> `StaffFormSheet` now posts the real value through a hidden input (rule added to CLAUDE.md, Forms →
> `Select`). Owner's run, checked in the DB: 2 staff created (one with no team, after the fix), 1
> `staff.update`, 8 `staff.set_team`; moves survive a reload (owner); the 8 moves match 8
> `staff_team_membership` changes (X6), and every staff member's current team equals their open
> membership. **Still to run:** deactivate an employee (no `staff.deactivate` yet), the same in Arabic.

## Phase D — Import engine (.xlsx / .md), employees first ⏳ checkpoint pending

- [x] **D1** Add `read-excel-file` and `write-excel-file`.
- [x] **D2** `src/lib/server/imports/parse.ts`: `.xlsx` via `read-excel-file/node`, Markdown table parser,
      header normalisation (trim, case, Arabic-Indic digits via `toAsciiDigits`).
- [x] **D3** `src/lib/server/imports/columns.ts`: the alias table above (the one file to edit for Odoo).
- [x] **D4** `src/lib/server/imports/staff-import.ts`: zod row validation, resolve function / team by key or
      EN / AR name, decide create / update / skip.
- [x] **D5** `services/imports.ts`: `previewImport(actor, kind, file)` → batch + rows;
      `commitImport(actor, batchId)` → upserts + `status = 'committed'` + audit in one `db.batch`;
      `import.run`; 2 MB / 2 000-row limits.
- [x] **D6** Routes: `(dashboard)/imports/` (upload: kind + file, accepts `.xlsx,.md`),
      `imports/[id]/` (preview with errors, confirm), `imports/template/[kind]/+server.ts` (`.xlsx` and `.md`
      templates). Add a params overload to `localizedHref` in `src/lib/i18n.ts`.

**Checkpoint D:** a sample `.xlsx` with Odoo-style headers and a `.md` with Arabic headers preview correctly;
bad rows are flagged and skipped; commit creates / updates staff; re-importing the same file changes
nothing; a file over 2 MB is rejected.

> **Result (2026-10-26) ⏳ NOT TESTED.** No upload or import has ever been run: no `import_batch` rows, no
> `import.*` / `staff.import_*` audit actions. **Paused by the owner** until the team shift & supervisor
> work (`ROSTER_PLAN.md`) lands, because that work changes what a staff import must carry (team →
> shifts). Before testing: re-check the staff import against the new model, regenerate the QA files
> (Odoo `.xlsx`, Arabic `.md`, > 2 MB), then run this checkpoint.

## Phase E — Flights ⏳

- [ ] **E1** `services/flights.ts`: list by Damascus day, create, update / reschedule (moves the active
      assignment window in the same batch; `23P01` → conflict message), cancel.
- [ ] **E2** `(dashboard)/flights/`: day picker, table (image, flight, direction, route, STA / STD, status,
      team), create / edit sheet with `image_url` and the handling window.
- [x] **E3** Flight import: Phase D engine with `kind = flights` (+ template).
- [ ] **E4** Sidebar link (`flight.read`); EN + AR messages.

**Checkpoint E:** CRUD and import of a sample schedule; times entered and shown in Damascus time, stored
in UTC; cancelling keeps the row with `status = 'cancelled'`.

## Phase X — Review fixes ⏳ (from the 2026-10-26 review; land before F)

Findings from reviewing A–E against CLAUDE.md. F builds on the assignment and import code, so fix these
first. Order is by severity; X17–X23 align the code with the rules added on 2026-10-26 (service split,
shared schemas, backend typing, UI rules) and may run alongside X1–X16.

### Bugs

- [x] **X1** Flight import keeps the active team assignment in sync with the flight window. When a row
      moves a flight but names no team, `commitFlights` updates `flight.handling_*` but skips the
      assignment (`services/imports.ts:278`, `if (!data.teamId) continue;`), so the overlap constraint
      checks a stale window. Move the active assignment's `starts_at` / `ends_at` in the same batch, with
      an audit row, exactly as `updateFlight` does.
- [x] **X2** Impossible dates never crash a request. `parseDateTime` / `parseDate` throw `RangeError` on
      e.g. `2026-02-30`, month 13, hour 25. `parseDamascusDateTime` (`server/time.ts:23`, `:31`) returns
      `null`, so the import row gets `invalid_datetime` instead of the whole preview failing with a 500.
      `damascusDayRange` (`time.ts:49`) treats an invalid `day` as today, so `/flights?day=2026-02-30`
      shows today's board instead of a 500.
- [x] **X3** A malformed batch id is a 404, not a 500. `/imports/abc` reaches a `uuid` column and Postgres
      raises `22P02`. Validate `id` with `z.uuid()` in `getImportBatch` / `commitImport` and throw
      `NotFoundError` (`imports/[id]/+page.server.ts`).

### Permissions and non-negotiable rules

- [x] **X4** Imports require the target's write permission, not only `import.run` (`services/imports.ts`
      `commitImport`, and `previewImport` so nobody previews what they can't commit): staff →
      `staff.write`; flights → `flight.write`, plus `assignment.write` when any row assigns a team. The
      permission matrix is configurable (§5), so `import.run` alone must not write staff, flights or
      assignments.
- [x] **X5** A handling-window override needs a reason (CLAUDE.md §6.3). When the submitted window differs
      from the default (create) or from the stored window without a rescheduled time (update), the flight
      sheet shows a required `overrideReason` field; the BL rejects a missing reason with a field error and
      writes it to the flight's `audit_log.reason`. A shift caused by rescheduling (`shiftHandlingWindow`)
      is not an override.
- [x] **X6** Team membership history, so the daily report can reconcile who worked a flight (§6.6,
      acceptance checklist). **Decided 2026-10-26: membership history table** (over snapshots on the
      assignment or per-person assignments). Table `staff_team_membership` (`staff_id`, `team_id`,
      `valid_from`, `valid_to` nullable = open, `created_at`) with `EXCLUDE USING gist (staff_id WITH =,
tstzrange(valid_from, valid_to, '[)') WITH &&)` so a person is in one team at a time. Every BL
      change to `staff.team_id` closes the open row and opens the next in the same `db.batch`:
      `setStaffTeam`, `createStaff` / `updateStaff`, `setStaffActive(false)`, `setTeamActive(false)` (all
      members), staff import create / update. The migration backfills an open row for every staff member
      with a team. The report (G) takes a flight's crew from memberships valid at the assignment's start.

> **Progress (2026-10-26):** X1–X6 landed. X4 changes nothing for today's roles (only `admin` /
> `operations_manager` hold `import.run`, and both hold every write permission). X5's rule lives in
> `isHandlingOverride` (`src/lib/flights/handling.ts`), shared by the flight sheet and the BL. X6:
> migrations `0008` / `0009` applied; builders in `services/membership.ts` are called by all seven
> `staff` writes. In a rolled-back transaction a second open membership fails `23P01`, close-then-open
> at the same instant succeeds, and a crew lookup at a point in time returns the right team.

### Medium

- [ ] **X7** Import never touches a cancelled flight's assignment. Matching (`imports/flight-import.ts:154`)
      includes cancelled flights; an update keeps `status = 'cancelled'` but can insert an active team
      assignment (`services/imports.ts:309`). Flag such rows `flight_cancelled` (skip) with an EN + AR
      label.
- [ ] **X8** Commit re-checks what preview resolved. A team or function deactivated (or a staff number
      taken) between preview and commit must not be written: re-load active teams / functions in
      `commitImport` and refuse with `ConflictError('stale_preview')` asking for a re-upload.
- [ ] **X9** Flight import pre-checks team overlaps (the plan's "app pre-checks" decision). In
      `buildFlightRows`, a row whose team already has an overlapping active assignment, or overlaps another
      row of the same file for that team, gets a `team_overlap` issue naming the other flight. The
      exclusion constraint stays the real guard.
- [ ] **X10** Cancelling a flight asks for confirmation (it also cancels the team assignment). Add the
      shadcn `alert-dialog` and confirm before `?/cancel` (`flights/+page.svelte:213`).

### Low

- [x] **X11** Flight image per the plan's decision: `referrerpolicy="no-referrer"` on the `<img>`, and the
      airline code as the fallback instead of the plane icon (`flights/+page.svelte:141`).
- [x] **X12** RTL: previous / next day carets get `rtl:rotate-180` (`flights/+page.svelte:101`, `:109`).
- [ ] **X13** _(flight sheet done; `imports/+page.svelte` left)_ Replace native `<select>` with hand-rolled classes (incl. `rounded-none`) by shadcn `Select`
      wired through Formsnap (`FlightFormSheet.svelte:109`, `:150`, `:180`; `imports/+page.svelte:48`).
- [ ] **X14** _(flight sheet done: opens through `show()`; team and staff sheets left)_ No `$effect` writing form data (`TeamFormSheet`, `StaffFormSheet`, `FlightFormSheet` ×2):
      reset the form in `openCreate` / `openEdit` (`form.reset({ data, … })`). The default window is
      applied when the scheduled time or direction changes only while the user hasn't edited the window
      (today the effect overwrites a typed window, `FlightFormSheet.svelte:94`).
- [ ] **X15** Staff import validates rows with zod (plan step D4), using the shared staff schema.
- [x] **X16** ESLint: drop the unused `relations` import (`schema/flights.ts:1`).

### Rules alignment (CLAUDE.md §3, added 2026-10-26)

- [ ] **X17** Split `services/teams.ts` into `services/teams/teams.crud.ts` + `teams.bl.ts`: CRUD holds
      only the queries the BL calls; write builders return `BatchQuery`; row types derived from the
      queries; explicit BL return types.
- [ ] **X18** Same split for `services/staff.ts`; remove `StaffRow` / `TeamOption` /
      `StaffFunctionOption` from `src/lib/types/workforce.ts`.
- [ ] **X19** Same split for `services/flights.ts`; remove `src/lib/types/flights.ts`.
- [ ] **X20** Same split for `services/imports.ts`; the DB reads in `server/imports/staff-import.ts` and
      `flight-import.ts` move into `imports.crud.ts` (the builders stay pure helpers).
- [ ] **X21** Same split for `services/users.ts`; move `BatchQuery` into `services/common.ts`.
- [ ] **X22** Shared schemas: move `flights/`, `employees/`, `teams/`, `admin/users/` `schema.ts` to
      `src/lib/schemas/<service>.schema.ts`; add `src/lib/schemas/enums.ts` tuples feeding the `pgEnum`s,
      `z.enum` and labels (replaces `flightStatusValues`, `DIRECTIONS`, `STATUSES`).
- [ ] **X23** UI rules in the plan's pages: `space-y-*` → `flex flex-col gap-*` (13), `{@const}` →
      declaration tags (3); one shared `toastNotice` helper instead of four copies; use `formToasts` in
      the sheets; drop the extra `invalidateAll()` after Superforms / `update()` already invalidated.

### Housekeeping

- [ ] **X24** Record the results of Checkpoints A–D here (A ✅ and B–D "not evidenced" recorded
      2026-10-26; B–D results pending the owner's run); tick E1, E2, E4 when Checkpoint E passes; commit
      once per phase from here on (nothing from A–E is committed yet).

**Checkpoint X:**

- An import that moves an assigned flight without a team column moves the assignment too; an overlap
  with that team's other flight is rejected.
- A file with `2026-02-30 10:00` previews with that row flagged; `/flights?day=2026-02-30` shows today;
  `/imports/abc` is a 404. No 500s in the server log.
- A session without `flight.write` (or `staff.write`) gets 403 committing a flights (staff) batch.
- Changing a flight's window without a reason shows a field error; with one, the audit row has `reason`.
- Cancelled flights, stale previews and overlapping team rows are flagged in the preview, not at commit.
- Cancelling a flight asks first. Moving a staff member between teams writes a closed and an open
  `staff_team_membership` row; two open rows for one person are rejected by the constraint.
- `pnpm check`, ESLint + Prettier on touched files, Svelte autofixer on touched `.svelte` files,
  `pnpm build`; flows re-tested in EN and AR.

## Phase F — Team ↔ flight assignment ⏳

- [ ] **F1** `services/assignments.ts`: assign team (pre-check overlap; the DB constraint is the real guard;
      map `23P01`), change team, unassign (cancel); `assignment.write`; audit.
- [ ] **F2** Flights table: team select per row and an "uncovered" badge.
- [ ] **F3** Teams page: each team's flights for the day.

**Checkpoint F:** an overlapping assignment is rejected by the backend with a localized error; a team on
back-to-back, non-overlapping flights works; cancelling a flight frees its team.

## Phase G — Flight report ⏳

- [ ] **G1** `(dashboard)/reports/flights/` (`?date=`): Qatar-style card per flight: image (`image_url`,
      fallback airline code), flight number, origin → destination, scheduled / estimated time
      (`formatDateTime`), status badge, team name + member count.
- [ ] **G2** Uncovered flights listed first and highlighted; print stylesheet; `report.read`.
- [ ] **G3** Sidebar link; EN + AR (RTL layout; times and flight numbers stay LTR).

**Checkpoint G:** the report matches the flights table for the same day in EN and AR.

## Phase H — Hardening & docs ⏳

- [ ] **H1** 403 sweep: every load and action guarded; a request without the permission gets 403.
- [ ] **H2** Security review of uploads (size / row limits, server-only parsing) and image URLs (https only).
      Includes `.xlsx` decompression: a 2 MB file can inflate far beyond that, and `read-excel-file` has
      no visible decompressed-size limit (unverified in the review).
- [ ] **H3** CLAUDE.md §4 / §7 updated; plan marked complete.

**Checkpoint H:** `pnpm check`, Prettier + ESLint on touched files, Svelte autofixer on touched `.svelte`
files, `pnpm build`; full flow re-tested in EN and AR.

## Reuse

- Actor / `AppError` (`#lib/server/errors.ts`) / `pgErrorCode` pattern and audit-in-batch: `src/lib/server/services/users.ts`.
- `auditInsert`: `src/lib/server/audit.ts`. `requirePermission`: `src/lib/server/rbac/guard.ts`.
- `formatDateTime`: `src/lib/utils/datetime.ts`. `toAsciiDigits` / `ID_DIGITS`: `src/lib/schemas/auth.schema.ts`.
- Sheets, forms, tables and `endSide` / `personName` helpers: `src/routes/(dashboard)/admin/users/`.
- Drag-and-drop components: `src/routes/(dashboard)/employees/`.

## Later

- [ ] **L1** Expand team assignments into per-person `assignment` rows (CLAUDE.md §7) when individuals
      need to be assigned outside their team.
- [ ] **L2** `handling_window_rule` table once the ops team confirms the minutes per direction / aircraft.
- [ ] **L3** Link `staff` to Odoo (`odoo_id`) and reconcile against a real Odoo export.
