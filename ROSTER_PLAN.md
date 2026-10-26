# Roster plan: team supervisors, shift cycles, team moves, attendance

Tracking file for the attendance core: who works when, who supervises them, and what actually happened.
Each step has an ID (`RB3`, `RG2`, …) so commits and reviews can point at it. Tick a step when it has
landed. Start the next phase only after the previous checkpoint is verified, record the result under the
checkpoint, and commit once per phase.

**Status:** RA–RI ⏳ (not started; plan written 2026-10-26). Baseline: `main` at `8b98ca2` (PR #1, the
operations core, on staging). `OPERATIONS_PLAN.md` Checkpoint D (upload & import) is paused until this
lands; its Phase X fixes can continue alongside.

## Goal

The app's core is attendance. For that it must know, for every employee and every day, whether they
should be working, when, and for how many hours, and who is responsible for checking.

- **Supervisors:** every team has one or more supervisors. A supervisor is a staff member with a sign-in
  account, and records attendance for the teams they supervise, and only those.
- **Shift cycles:** every team follows a repeating cycle of N days, each day **Day**, **Night** or
  **Off**, anchored to a start date, with the Day and Night shift times and the **required working hours
  per day**.
- **Team moves:** when an employee changes team, a manager picks the effective date. Before it the old
  team's cycle applies, from it the new team's, so their shifts and off days change with the team.
- **Attendance:** supervisors record check-in / check-out / breaks and absences against each person's
  rostered shift; the app shows who is late or missing and whether each worked day met the required
  hours; a daily report reconciles it.

## Decisions (owner, 2026-10-26)

| Topic            | Decision                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope            | Recurring team rosters were CLAUDE.md Phase 4 ("do not build yet"). **The owner moves them into the MVP**, because attendance needs to know who should be working. Still out: automatic roster optimization, overtime pay calculations, forecasting (CLAUDE.md §6.7). Overtime is only _flagged_ here.        |
| Shift pattern    | **Repeating cycle**: a team's cycle is 1–28 days, each `day` / `night` / `off`, anchored to a Damascus date (cycle day 1). A weekly pattern is a 7-day cycle; e.g. `day day night night off off off off` is an 8-day rotation.                                                                                |
| Shift times      | Per team pattern: Day start / end and Night start / end as Damascus wall-clock times. An end at or before its start ends the next day (night 19:00 → 07:00 +1). A shift belongs to the **date it starts**.                                                                                                    |
| Required hours   | **Required hours per working day**, per team pattern (stored as minutes). A worked day below it is flagged _short_, above it _over_.                                                                                                                                                                          |
| Pattern changes  | Patterns are **versioned** (`effective_from` / `effective_to`), never edited in place, so past rosters and reports stay as they were (CLAUDE.md §6.6).                                                                                                                                                        |
| Supervisors      | **Sign-in accounts.** A supervisor is a `staff` row linked to a `user` with role `supervisor` (`staff.user_id`). A team has 1..n supervisors; a supervisor may supervise several teams and may or may not be a member of one. Auth changes go together with `AUTH_PLAN.md` (CLAUDE.md §8).                    |
| Supervisor scope | A supervisor records attendance only for people who are members of a team they supervise **on that shift's date**. Admin and operations manager are unscoped.                                                                                                                                                 |
| Team moves       | **Manager picks the effective date** (default today; future dates allowed). `staff_team_membership` (OPERATIONS X6) becomes the **source of truth** for "which team, when"; `staff.team_id` is removed once nothing reads it. A pending future move shows on the employee.                                    |
| Roster storage   | **Computed, not stored.** A person's roster for a day = their membership on that date → the team's pattern version on that date → the cycle day → the shift window; then per-person **overrides** (swaps, extra shift, day off) and **absences** on top. Nothing to regenerate when patterns or teams change. |
| Attendance       | `attendance_event` is **append-only** (CLAUDE.md §7); corrections are new events with a `reason`. Each event stores the shift date and kind it was counted for, so reports never shift when patterns change later.                                                                                            |
| Engine & tests   | The roster calculation is a pure, client-safe module (`src/lib/roster/`), used by the server and for previews. It gets real unit tests: **add Vitest** as a dev dependency (there is no test runner today).                                                                                                   |

## Open questions (ask the ops team; do not invent, CLAUDE.md §10)

Proposed defaults are marked _proposed_; they are used only after the owner confirms them in RA1.

1. Default Day / Night times (_proposed 07:00–19:00 / 19:00–07:00_), and whether they are per team or airport-wide.
2. Default required hours per working day (_proposed 12 h, or 11 h if a 1 h break is unpaid_).
3. Break policy: do breaks count as worked time? Maximum break length? (CLAUDE.md §10 "shift and break policy")
4. Minimum rest between the last old-team shift and the first new-team shift on a team move: warn only, or
   block? Threshold (_proposed: warn below 12 h_). (CLAUDE.md §10 "minimum rest")
5. Late grace (_proposed 15 min_) and the window that attributes a check-in to a shift (_proposed from 2 h
   before start to 4 h after end_).
6. May supervisors also record absences and roster overrides (swaps, extra shifts), or only check-ins?
7. May a team move be backdated (with a reason), or only today and later?
8. Maximum cycle length (_proposed 28 days_).
9. Do supervisors work shifts themselves (are they rostered as team members)?

## Data model

New, in `src/lib/server/db/schema/{roster,attendance}.ts`; enums as `as const` tuples in
`src/lib/schemas/enums.ts` feeding `pgEnum` (CLAUDE.md §3 typing rules).

| Table / enum                    | Columns & constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shift_kind` enum               | `day`, `night`, `off`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `team_shift_pattern`            | `team_id`, `cycle shift_kind[]` (CHECK `cardinality` 1–28 and at least one non-`off`), `anchor_date date`, `day_start` / `day_end` / `night_start` / `night_end` `time`, `required_minutes int` (CHECK 1–1440), `effective_from date`, `effective_to date` null = open, `created_by`, timestamps. `EXCLUDE USING gist (team_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&)`. Dates and times here are Damascus wall-clock **rules**, not instants, like the handling-window minutes; every instant derived from them is `timestamptz`. |
| `team_supervisor`               | `team_id`, `staff_id`, `added_by`, `added_at`, `removed_by`, `removed_at` null. Partial unique (`team_id`, `staff_id`) where `removed_at IS NULL`. BL rule: the staff member has an active `supervisor` account.                                                                                                                                                                                                                                                                                                                                          |
| `staff_team_membership` (X6)    | Exists. Now the source of truth; `valid_from` may be in the future (effective date at 00:00 Damascus). `staff.team_id` dropped in RE5.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `roster_override`               | `staff_id`, `shift_date date`, `kind` (`day` / `night` / `off` / `custom`), `starts_at` / `ends_at` timestamptz (only for `custom`), `reason` NOT NULL, `created_by`, `cancelled_at` null. Partial unique (`staff_id`, `shift_date`) where not cancelled.                                                                                                                                                                                                                                                                                                 |
| `attendance_event_type` enum    | `check_in`, `check_out`, `break_start`, `break_end`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `attendance_event`              | **Append-only**: `staff_id`, `type`, `occurred_at timestamptz`, `shift_date date`, `shift_kind`, `team_id` (team on that date), `recorded_by`, `note`, `corrects_event_id` null, `reason` (required when correcting). Index (`staff_id`, `occurred_at`), (`team_id`, `shift_date`).                                                                                                                                                                                                                                                                       |
| `absence_type` enum / `absence` | `staff_id`, `starts_on` / `ends_on` date (Damascus, inclusive), `type` (`sick` / `leave` / `no_show` / `other`), `reason`, `recorded_by`, `cancelled_at` null. Day-granular, because rosters are (CLAUDE.md §7 lists `starts_at` / `ends_at`; RA2 updates it).                                                                                                                                                                                                                                                                                            |
| permission `roster.manage`      | New key: edit patterns, supervisors, overrides and team moves. Seeded for `admin`, `operations_manager`. Constant in `rbac/permissions.ts` + seed migration together (CLAUDE.md §7).                                                                                                                                                                                                                                                                                                                                                                      |

**Derived, not stored:** a person's rostered shift per day, attendance status (expected / present / late /
missing / on break / done / absent / off / unscheduled), worked minutes (check-in → check-out minus
breaks), short / over against the required minutes.

---

## Phase RA — Decisions & docs ⏳

- [ ] **RA1** Settle the open questions above with the ops team; record each answer here and in
      CLAUDE.md §10 (move resolved ones out of "open").
- [ ] **RA2** CLAUDE.md: §1 phase table (recurring team rosters in the MVP by owner decision; optimization
      and overtime pay stay later), §5 glossary (shift cycle, roster, effective date, supervisor scope),
      §7 entities (the data model above; `staff_team_membership` as source of truth; `absence` dates),
      §4 layout (`src/lib/roster/`, new services and routes).
- [ ] **RA3** `AUTH_PLAN.md` amendment: `supervisor` joins `ACCOUNT_ROLES`; a supervisor account must be
      linked to a staff member; code issuing unchanged (admins issue codes); `user.issue_code` for
      employees stays dormant.
- [ ] **RA4** Add Vitest (dev dependency, `pnpm test` script) for the roster engine and pure helpers.

**Checkpoint RA:** every open question answered or explicitly deferred with a default; CLAUDE.md and
AUTH_PLAN.md updated; `pnpm test` runs.

## Phase RB — Schema & migrations ⏳

- [ ] **RB1** `src/lib/schemas/enums.ts`: `SHIFT_KINDS`, `ATTENDANCE_EVENT_TYPES`, `ABSENCE_TYPES` tuples.
- [ ] **RB2** `schema/roster.ts`: `team_shift_pattern`, `team_supervisor`, `roster_override`; relations;
      `$type` on `cycle`.
- [ ] **RB3** `schema/attendance.ts`: `attendance_event`, `absence`; relations.
- [ ] **RB4** `pnpm db:generate` → read the SQL.
- [ ] **RB5** Custom migration: pattern-version `EXCLUDE` constraint, `cycle` cardinality / non-off
      `CHECK`s, partial uniques, `roster.manage` permission + role seed.
- [ ] **RB6** `pnpm db:migrate`.

**Checkpoint RB:** in a rolled-back transaction: two overlapping pattern versions for one team fail
`23P01`; back-to-back versions succeed; a 29-day or all-`off` cycle fails the `CHECK`; a second active
supervisor row for the same pair fails `23505`. `pnpm check` clean.

## Phase RC — Roster engine (pure, tested) ⏳

- [ ] **RC1** `src/lib/roster/cycle.ts`: cycle day for a date (`(date − anchor) mod N`, also before the
      anchor), shift window for a date and kind in Damascus (night crosses midnight; via
      `@internationalized/date`).
- [ ] **RC2** `src/lib/roster/roster.ts`: `rosterDay` / `rosterRange` from memberships, pattern versions,
      overrides and absences. Per person per date it returns the team, the kind, the start and end
      instants, the required minutes and the source (pattern or override).
- [ ] **RC3** `src/lib/roster/attendance.ts`: attribute an event to a shift (window from RA1), status of a
      shift from its events, worked minutes, short / over, late.
- [ ] **RC4** `src/lib/roster/rest.ts`: rest gap between the last old-team shift and the first new-team
      shift for a proposed move.
- [ ] **RC5** Unit tests: 7- and 8-day cycles, dates before the anchor, night across midnight and month
      end, pattern version change mid-cycle, team move mid-cycle, override and absence precedence,
      attribution at window edges, breaks, short / over.

**Checkpoint RC:** `pnpm test` green; the cases above covered.

## Phase RD — Team patterns & supervisors (server + UI) ⏳

Services follow CLAUDE.md §3: `services/roster/roster.{bl,crud}.ts`; team supervisor functions in
`services/teams/teams.{bl,crud}.ts` (this phase does OPERATIONS X17 for teams if it hasn't landed).

- [ ] **RD1** BL: set a team's pattern from an effective date (closes the current version, opens the
      next, audit with `reason`); list versions. `roster.manage`.
- [ ] **RD2** BL: add / remove a team supervisor (must be an active `supervisor` account linked to the
      staff member); audit. `roster.manage`.
- [ ] **RD3** Route `/teams/[id]` (`localizedHref` params overload): members (current + scheduled moves),
      supervisors, shift pattern editor (cycle length, a Day / Night / Off cell per cycle day, anchor
      date, shift times, required hours, effective from), pattern history.
- [ ] **RD4** 4-week roster preview grid on the team page (rows: members on each date; columns: days;
      cells D / N / Off), from the RC engine.
- [ ] **RD5** Teams list: each team's pattern summary and supervisors. EN + AR, RTL, times LTR in `<bdi>`.

**Checkpoint RD:** a team gets an 8-day cycle from next Monday; the preview matches the cycle by hand; a
pattern change from a future date leaves earlier days unchanged; supervisors added / removed with audit
rows; EN + AR.

## Phase RE — Team moves with an effective date ⏳

- [ ] **RE1** BL `moveStaff(actor, staffId, teamId | null, effectiveDate)`: closes the membership at the
      effective date, opens the next; replaces a pending future move; rejects dates before today
      (unless RA1 allows backdating with a reason); audit. `roster.manage`.
- [ ] **RE2** Move dialog on `/employees`: drag-and-drop and the row action open it with the date
      (default today), the old / new team, and the RC4 rest-gap warning.
- [ ] **RE3** Readers move from `staff.team_id` to the membership on a date: employees list, team member
      counts, flight crew lookups, team deactivation, staff import commit.
- [ ] **RE4** Employee row shows a pending move ("→ Team B from 3 Nov").
- [ ] **RE5** Migration: drop `staff.team_id` once nothing reads it (OPERATIONS X6 backfill guarantees
      every current team has an open membership).

**Checkpoint RE:** a move dated next week leaves this week's roster on the old team and next week's on
the new one; a move into a team whose first shift starts soon after the last old shift shows the warning;
no code reads `staff.team_id`; the membership consistency query returns no rows.

## Phase RF — Supervisor accounts (with AUTH_PLAN.md) ⏳

- [ ] **RF1** `ACCOUNT_ROLES` += `supervisor`; `/admin/users` creates a supervisor account linked to a
      staff member (`staff.user_id`), issues the first code; audit.
- [ ] **RF2** `Actor` gains `supervisedTeamIds`, loaded with the session in `hooks.server.ts`;
      `requireTeamAccess(actor, teamId, date)` in `services/common.ts` (unscoped for `roster.manage`).
- [ ] **RF3** Nav for supervisors: Attendance and their teams only; every other route still guarded by
      its permission.
- [ ] **RF4** 403 sweep: a supervisor posting attendance for a team they don't supervise gets 403; a
      deactivated supervisor loses access at once (session reload, CLAUDE.md §8).

**Checkpoint RF:** a supervisor signs in, sees only their teams, records for them, and gets 403 for any
other team or admin route; removing them as supervisor cuts the access on the next request.

## Phase RG — Attendance recording ⏳

- [ ] **RG1** `services/attendance/attendance.{bl,crud}.ts`: record check-in / check-out / break start /
      end (append-only; stores `shift_date`, `shift_kind`, `team_id` from RC3; scope via RF2), correction
      events with `reason`, absences (create / cancel with reason), roster overrides (per RA1 Q6);
      audit every write in the same batch.
- [ ] **RG2** `/attendance`: date (default today) and team (supervisors: theirs only); per shift, each
      rostered person with status, times and one-tap actions; unscheduled check-in on an off day allowed
      with a reason.
- [ ] **RG3** Late / missing / on-break indicators from RC3; refreshed with `invalidate()` polling
      (CLAUDE.md §6.8).
- [ ] **RG4** Worked minutes vs required minutes per person per day, flagged short / over.
- [ ] **RG5** EN + AR; all times Damascus in `<bdi>`.

**Checkpoint RG:** a night shift's check-in at 18:50 and check-out at 07:05 next day count for the
night's date; a person with no check-in 20 min after start shows missing; an absence hides them from
missing; a correction keeps the original event and shows the new one; a supervisor can't record for
another team.

## Phase RH — Daily attendance report ⏳

- [ ] **RH1** `/reports/attendance?date=&team=`: per team and shift: scheduled, present, late, missing,
      absent, off, unscheduled; per person worked vs required hours. `report.read`; supervisors scoped.
- [ ] **RH2** Reconciliation: report totals equal the events and absences for that date (a query in the
      checkpoint); history stays the same after a later pattern change or team move.
- [ ] **RH3** Print stylesheet; EN + AR.

**Checkpoint RH:** the report for a test day matches the events entered in RG by hand; changing the
team's pattern afterwards doesn't change that day's report.

## Phase RI — Integration, import & hardening ⏳

- [ ] **RI1** Flight assignment (OPERATIONS Phase F) pre-checks the team's roster: warn when the
      handling window falls on the team's off day or outside its shift.
- [ ] **RI2** Staff import: team column → membership effective on the commit date (or a date column, per
      RA1); re-check the import against the new model, then resume OPERATIONS Checkpoint D.
- [ ] **RI3** Security pass: supervisor scope on every attendance load / action, pattern and move
      permissions, no `staff.team_id` left; CLAUDE.md §4 / §7 final; `pnpm check`, ESLint, Prettier,
      Svelte autofixer, `pnpm build`.

**Checkpoint RI:** full flow in EN and AR: set a team's cycle → add supervisors → move an employee with a
date → the supervisor records a day → the report reconciles; then OPERATIONS Checkpoint D passes.

## Order with `OPERATIONS_PLAN.md`

- Phase X fixes (X7–X23) may continue alongside RA–RC. X17 / X18 (teams / staff service split) should
  land before or with RD / RE, since those phases add to the same services.
- OPERATIONS Checkpoint D (upload & import) waits for RI2.
- OPERATIONS Phase F (team ↔ flight assignment) should start after RC, so RI1 can use the roster engine.

## Reuse

- Membership history and its builders: `src/lib/server/services/membership.ts`, migrations `0008` / `0009`.
- Damascus time helpers: `src/lib/server/time.ts`, `src/lib/utils/datetime.ts`.
- Errors and action helpers: `src/lib/server/errors.ts` (`AppError`, `failForm`, `failNotice`).
- Permission helper: `requireActorPermission` in `src/lib/server/services/common.ts`.
- Sheets, Formsnap fields, `Select` wiring (incl. the placeholder-item exception): CLAUDE.md §3 Forms.
