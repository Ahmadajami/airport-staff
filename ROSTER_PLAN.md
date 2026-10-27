# Roster plan: shift cycles, team moves, attendance, overtime

Tracking file for the attendance core: who works when, what actually happened, and how much overtime it
made. Each step has an ID (`RB3`, `RG2`, …) so commits and reviews can point at it. Tick a step when it has
landed. Start the next phase only after the previous checkpoint is verified, record the result under the
checkpoint, and commit once per phase.

**Status:** RA ✅ (2026-10-27, not committed yet) · RB–RI ⏳. Baseline: `main` at `8b98ca2` (PR #1, the operations core, on staging). `OPERATIONS_PLAN.md` Checkpoint D (upload &
import) is paused until this lands; its Phase X fixes can continue alongside.

## Goal

The app's core is attendance. For that it must know, for every employee and every day, whether they
should be working, when, and how long they actually worked.

- **Shift cycles:** every team, and some individuals (admin staff, supervisors), follow a repeating cycle
  of N days, each day **Day**, **Night** or **Off**, anchored to a start date. Every shift is 12 h.
- **Team moves:** when an employee changes team, the admin picks the effective date. Before it the old
  team's cycle applies, from it the new team's, so their shifts and off days change with the team.
- **Attendance:** the admin records check-in / check-out / breaks and absences against each person's
  rostered shift; the app shows who is late or missing, and each day's overtime; a daily report
  reconciles it.
- **Supervisors:** each team lists its supervisors (staff members). They have **no sign-in and no
  recording rights yet**; supervisor accounts are Later.

## Decisions (owner, 2026-10-26 / 27)

| Topic             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope             | Recurring rosters were CLAUDE.md Phase 4 ("do not build yet"). **The owner moves them into the MVP**, because attendance needs to know who should be working. **Overtime hours** are calculated. Still out: overtime pay, automatic roster optimization, forecasting (CLAUDE.md §6.7).                                                                                                                                                                                                                        |
| Who does it       | **Only admin**: shift times, cycles, team moves, overrides, swaps, attendance, absences, overtime approval. No approval step; what the admin saves is live. Operations managers (and the dormant supervisor role) lose `attendance.record`; supervisors get a different job later.                                                                                                                                                                                                                            |
| Shift pattern     | **Repeating cycle** entered by the admin cell by cell (Day / Night / Off), 1–28 days, anchored to a Damascus date (cycle day 1). No built-in presets; the editor can copy another pattern's cycle to start from.                                                                                                                                                                                                                                                                                              |
| Pattern owner     | A pattern belongs to a **team**, or to **one person** (admin staff and supervisors follow their own). On a date where a person has a personal pattern, it wins over their team's.                                                                                                                                                                                                                                                                                                                             |
| Shift times       | **Only 12 h shifts.** The admin enters the Day start and Night start once, airport-wide (`app_setting`); each shift ends 12 h later (a night ends the next day). Each pattern version copies the times when saved, so a later change never rewrites history.                                                                                                                                                                                                                                                  |
| Shift date        | A shift belongs to the **date it starts**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Pattern changes   | Patterns are **versioned** (`effective_from` / `effective_to`), never edited in place, so past rosters and reports stay as they were (CLAUDE.md §6.6).                                                                                                                                                                                                                                                                                                                                                        |
| Team moves        | **Admin picks the effective date**: today or later, **never backdated**. No minimum-rest check. `staff_team_membership` (OPERATIONS X6) becomes the **source of truth** for "which team, when"; `staff.team_id` is removed once nothing reads it. A pending future move shows on the employee.                                                                                                                                                                                                                |
| Swaps             | A swap between two people is **one linked action**: its overrides share a `swap_group_id`, are created in one batch, and are cancelled together.                                                                                                                                                                                                                                                                                                                                                              |
| Roster storage    | **Computed, not stored.** A person's roster for a day = personal pattern, else their team (membership on that date) → that pattern's version on that date → cycle day → shift window; then **overrides** and **absences** on top. Nothing to regenerate when patterns or teams change.                                                                                                                                                                                                                        |
| Attendance        | `attendance_event` is **append-only** (CLAUDE.md §7); corrections are new events with a `reason`. Each event stores the shift date and kind it was counted for, so reports never shift when patterns change later.                                                                                                                                                                                                                                                                                            |
| Attendance rules  | **Breaks are paid**: worked minutes = check-in → check-out, breaks not subtracted (break events only drive "on break"). **Late** after 15 min. An event belongs to the shift whose window runs from 2 h before its start to 7 h after its end (window chosen by Claude, so a long stay still attributes).                                                                                                                                                                                                     |
| Overtime          | **Per day**, no legal rules, no carry-over: on a rostered shift, overtime = worked minutes − 720 when positive (12 h 40 m worked = 40 m). On an **extra shift** (a Day / Night override on an off day that isn't a swap) or an unscheduled check-in on an off day, **all** worked minutes are overtime (a full extra shift = 12 h). **Rounded to the nearest 15 min** (half up: 7 m → 0, 8 m → 15, 40 m → 45). Shown as decimal hours and `h:mm`. Two categories, by the shift's kind: **Day** and **Night**. |
| Overtime approval | **Only admins** approve (`overtime.approve`, seeded for `admin` only). An approval stores the approved minutes; if later corrections change the computed overtime, the day shows "changed since approval".                                                                                                                                                                                                                                                                                                    |
| Overtime warning  | Warn (never block) when one shift date has more than **18 h worked** (12 h + a half shift). Chosen by Claude at the owner's request.                                                                                                                                                                                                                                                                                                                                                                          |
| Cycle length      | 1–28 days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Engine & tests    | The roster calculation is a pure, client-safe module (`src/lib/roster/`), used by the server and for live previews. It gets real unit tests: **add Vitest** as a dev dependency (there is no test runner today).                                                                                                                                                                                                                                                                                              |

## Open questions (ask the ops team; do not invent, CLAUDE.md §10)

None left for RA–RI: every answer is in Decisions. Supervisor rights, alignment, coverage targets,
presets, holidays and export are Later. New questions go here before they are acted on.

## Data model

New, in `src/lib/server/db/schema/{roster,attendance,settings}.ts`; enums as `as const` tuples in
`src/lib/schemas/enums.ts` feeding `pgEnum` (CLAUDE.md §3 typing rules).

| Table / enum                    | Columns & constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_setting`                   | `key text` PK (`$type<SettingKey>()`), `value jsonb` (`$type` per key), `updated_by`, `updated_at`. Key: `roster.shift_starts` `{ day: 'HH:mm', night: 'HH:mm' }`. Not seeded: the pattern editor asks the admin to set it first. Changes are audited (§6.3). `settings.manage`.                                                                                                                                                                                                                                                                                                                                     |
| `shift_kind` enum               | `day`, `night`, `off`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `shift_pattern`                 | `team_id` **or** `staff_id` (CHECK `num_nonnulls(team_id, staff_id) = 1`), `cycle shift_kind[]` (CHECK `cardinality` 1–28 and at least one non-`off`), `anchor_date date`, `day_start` / `night_start` `time` (copied from `app_setting`; each shift is 12 h), `effective_from date`, `effective_to date` null = open, `reason`, `created_by`, timestamps. `EXCLUDE USING gist (team_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&) WHERE (team_id IS NOT NULL)` and the same on `staff_id`. Dates and times are Damascus wall-clock **rules**; every instant derived from them is `timestamptz`. |
| `team_supervisor`               | `team_id`, `staff_id`, `added_by`, `added_at`, `removed_by`, `removed_at` null. Partial unique (`team_id`, `staff_id`) where `removed_at IS NULL`. Information only for now (no account, no scope).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `staff_team_membership` (X6)    | Exists. Now the source of truth; `valid_from` may be in the future (effective date at 00:00 Damascus). `staff.team_id` dropped in RE5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `roster_override`               | `staff_id`, `shift_date date`, `kind shift_kind` (a 12 h Day / Night, or Off), `reason` NOT NULL, `swap_group_id uuid` null (the overrides of one swap), `created_by`, `cancelled_by`, `cancelled_at` null. Partial unique (`staff_id`, `shift_date`) where not cancelled.                                                                                                                                                                                                                                                                                                                                           |
| `attendance_event_type` enum    | `check_in`, `check_out`, `break_start`, `break_end`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `attendance_event`              | **Append-only**: `staff_id`, `type`, `occurred_at timestamptz`, `shift_date date`, `shift_kind`, `team_id` (team on that date, null for no team), `recorded_by`, `note`, `corrects_event_id` null, `reason` (required when correcting). Index (`staff_id`, `occurred_at`), (`team_id`, `shift_date`).                                                                                                                                                                                                                                                                                                                |
| `absence_type` enum / `absence` | `staff_id`, `starts_on` / `ends_on` date (Damascus, inclusive), `type` (`sick` / `leave` / `no_show` / `other`), `reason`, `recorded_by`, `cancelled_at` null. Day-granular, because rosters are (CLAUDE.md §7 lists `starts_at` / `ends_at`; RA2 updates it).                                                                                                                                                                                                                                                                                                                                                       |
| `overtime_approval`             | `staff_id`, `shift_date date`, `shift_kind`, `minutes int` (approved, CHECK > 0), `approved_by`, `approved_at`, `revoked_by`, `revoked_at` null. Partial unique (`staff_id`, `shift_date`) where not revoked. Approve and revoke are audited.                                                                                                                                                                                                                                                                                                                                                                        |
| permission `roster.manage`      | New key: patterns, supervisors list, overrides, swaps and team moves. Seeded for `admin` only. Constant in `rbac/permissions.ts` + seed migration together (CLAUDE.md §7).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| permission `overtime.approve`   | New key: approve / revoke a day's overtime. Seeded for `admin` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `attendance.record` (existing)  | Removed from `operations_manager` and `supervisor` in a new seed migration (never by editing `0001`); stays on `admin`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Derived, not stored:** a person's rostered shift per day, attendance status (expected / present / late /
missing / on break / done / absent / off / unscheduled), worked minutes (check-in → check-out, breaks
included), short (under 12 h on a rostered shift), overtime minutes per day (rounded, Day or Night,
extra shifts counted whole), the over-18 h warning, and whether an approval still matches.

---

## Phase RA — Decisions & docs ✅

- [x] **RA1** Settle the open questions above; record each answer here (done 2026-10-27). CLAUDE.md §10:
      move the resolved ones (shift and break policy, minimum rest) out of "open" in RA2.
- [x] **RA2** CLAUDE.md: §1 phase table (recurring rosters and overtime hours in the MVP by owner decision;
      optimization, overtime pay and supervisor accounts stay later), §5 glossary (shift cycle, roster,
      personal pattern, effective date, overtime), §7 entities (the data model above;
      `staff_team_membership` as source of truth; `absence` dates; `app_setting` keys), §4 layout
      (`src/lib/roster/`, new services and routes).
- [x] **RA3** Add Vitest (dev dependency, `pnpm test` script) for the roster engine and pure helpers.

**Checkpoint RA:** every open question answered or explicitly deferred with a default; CLAUDE.md updated;
`pnpm test` runs.

_Result (2026-10-27):_ no open questions left. CLAUDE.md §1 (phase table), §2 (`pnpm test`, test
rules), §4 (layout), §5 (admin-only roster work, glossary), §7 (applied migrations, entities, derived
data, Phase 4+), §10 (resolved policies) and §11 updated. Vitest 5.0.5 configured in `vite.config.ts`
(`src/**/*.test.ts`, Node, `requireAssertions`); first suite `src/lib/server/time.test.ts` (8 tests on
the Damascus time helpers) passes. `pnpm check`: 0 errors (1 existing warning in
`ui/stepper/stepper-item.svelte`). `pnpm lint` still fails on Prettier for 150 files this change didn't
touch.

## Phase RB — Schema & migrations ⏳

- [ ] **RB1** `src/lib/schemas/enums.ts`: `SHIFT_KINDS`, `ATTENDANCE_EVENT_TYPES`, `ABSENCE_TYPES` tuples.
- [ ] **RB2** `schema/settings.ts`: `app_setting` with typed keys and values.
- [ ] **RB3** `schema/roster.ts`: `shift_pattern` (team or personal), `team_supervisor`,
      `roster_override` (with `swap_group_id`), `overtime_approval`; relations; `$type` on `cycle`.
- [ ] **RB4** `schema/attendance.ts`: `attendance_event`, `absence`; relations.
- [ ] **RB5** `pnpm db:generate` → read the SQL.
- [ ] **RB6** Custom migration: the two pattern-version `EXCLUDE` constraints (team, person), the
      `num_nonnulls` owner `CHECK`, `cycle` cardinality / non-off `CHECK`s, partial uniques,
      `roster.manage` and `overtime.approve` permissions + admin seed, `attendance.record` removed from
      `operations_manager` and `supervisor`.
- [ ] **RB7** `pnpm db:migrate`.

**Checkpoint RB:** in a rolled-back transaction: two overlapping pattern versions for one team (or one
person) fail `23P01`; a pattern with both or neither owner fails the `CHECK`; back-to-back versions
succeed; a 29-day or all-`off` cycle fails the `CHECK`; a second active supervisor row for the same pair
or a second active override for one person and date fails `23505`; `role_permission` gives
`attendance.record`, `roster.manage` and `overtime.approve` to `admin` only. `pnpm check` clean.

## Phase RC — Roster engine (pure, tested) ⏳

- [ ] **RC1** `src/lib/roster/cycle.ts`: cycle day for a date (`(date − anchor) mod N`, also before the
      anchor), the 12 h shift window for a date and kind in Damascus (night crosses midnight; via
      `@internationalized/date`).
- [ ] **RC2** `src/lib/roster/roster.ts`: `rosterDay` / `rosterRange` from memberships, team and personal
      pattern versions, overrides and absences. Precedence: absence → override → personal pattern →
      team pattern. Per person per date it returns the team, the kind, the start and end instants and the
      source (personal / team pattern or override).
- [ ] **RC3** `src/lib/roster/attendance.ts`: attribute an event to a shift (2 h before start to 7 h after
      end), status of a shift from its events, worked minutes (breaks included), short, late (> 15 min).
- [ ] **RC4** `src/lib/roster/overtime.ts`: per person per day, overtime = worked − 720 when positive on a
      rostered shift, or all worked minutes on an extra shift / unscheduled day; rounded to the nearest
      15 min (half up); Day / Night from the shift kind; the over-18 h warning; approval state (none /
      approved / changed since approval). Formatting as decimal hours and `h:mm`.
- [ ] **RC5** Unit tests: 3-, 4-, 7- and 8-day cycles, dates before the anchor, night across midnight and
      month end, pattern version change mid-cycle, team move mid-cycle, personal pattern over team
      pattern, swap groups, override and absence precedence, attribution at window edges, breaks
      counted as worked, late at 15 / 16 min, short; overtime at exactly 12 h, 12 h 07 m (0), 12 h 08 m
      (15 m), 12 h 40 m (45 m), a night stay past the morning, an extra shift (12 h) vs a swapped shift
      (0), the 18 h warning, an approval that no longer matches.

**Checkpoint RC:** `pnpm test` green; the cases above covered.

## Phase RD — Settings, patterns & supervisors list (server + UI) ⏳

Services follow CLAUDE.md §3: `services/settings/settings.{bl,crud}.ts`,
`services/roster/roster.{bl,crud}.ts`; team supervisor functions in `services/teams/teams.{bl,crud}.ts`
(this phase does OPERATIONS X17 for teams if it hasn't landed).

- [ ] **RD1** `/admin/settings` (`settings.manage`): Day start and Night start (ends shown as +12 h);
      audited.
- [ ] **RD2** BL: set a team's or a person's pattern from an effective date (closes the current version,
      opens the next, copies the shift times, audit with `reason`); list versions. `roster.manage`.
- [ ] **RD3** BL: add / remove a team supervisor (any active staff member); audit. `roster.manage`.
- [ ] **RD4** Route `/teams/[id]` (`localizedHref` params overload): members (current + scheduled moves),
      supervisors, pattern history, and the **quick pattern editor** (one shared component): paint the
      cycle (click / drag across cells, keys `D` / `N` / `O`, cycle length follows), "copy from" another
      pattern, anchor date, effective from, reason.
- [ ] **RD5** Live 4-week roster preview under the editor (rows: members on each date; columns: days;
      cells D / N / Off), computed in the browser by the RC engine on every change, no server round trip.
- [ ] **RD6** Personal pattern on the employee (admin staff, supervisors): the same editor and preview for
      one person, plus a badge on the employees list for who follows their own pattern.
- [ ] **RD7** Teams list: each team's pattern summary and supervisors. EN + AR, RTL, times LTR in `<bdi>`.

**Checkpoint RD:** without shift times set, the editor asks for them; a team gets an 8-day cycle from next
Monday; another copies it; a supervisor gets a personal pattern that overrides their team's in the
preview; the preview matches the cycle by hand; a pattern change from a future date leaves earlier days
unchanged; changing the shift times afterwards leaves existing versions unchanged; settings, patterns
and supervisors are audited; EN + AR.

## Phase RE — Team moves with an effective date ⏳

- [ ] **RE1** BL `moveStaff(actor, staffId, teamId | null, effectiveDate)`: closes the membership at the
      effective date, opens the next; replaces a pending future move; rejects dates before today
      (`InvalidInputError`); audit. `roster.manage`.
- [ ] **RE2** Move dialog on `/employees`: drag-and-drop and the row action open it with the date
      (default today, earlier dates disabled) and the old / new team.
- [ ] **RE3** Readers move from `staff.team_id` to the membership on a date: employees list, team member
      counts, flight crew lookups, team deactivation, staff import commit.
- [ ] **RE4** Employee row shows a pending move ("→ Team B from 3 Nov").
- [ ] **RE5** Migration: drop `staff.team_id` once nothing reads it (OPERATIONS X6 backfill guarantees
      every current team has an open membership).

**Checkpoint RE:** a move dated next week leaves this week's roster on the old team and next week's on
the new one; a move posted with yesterday's date gets 400; no code reads `staff.team_id`; the membership consistency query returns no rows.

## Phase RG — Attendance & overtime recording ⏳

- [ ] **RG1** `services/attendance/attendance.{bl,crud}.ts`: record check-in / check-out / break start /
      end (append-only; stores `shift_date`, `shift_kind`, `team_id` from RC3), correction events with
      `reason`, absences (create / cancel with reason), roster overrides, swaps as one action (both
      sides' overrides with one `swap_group_id` in one batch; cancelling cancels the group); audit every
      write in the same batch. `attendance.record` / `roster.manage`.
- [ ] **RG2** `/attendance`: date (default today) and team; per shift, each rostered person with status,
      times and one-tap actions; unscheduled check-in on an off day allowed with a reason.
- [ ] **RG3** Late / missing / on-break indicators from RC3; refreshed with `invalidate()` polling
      (CLAUDE.md §6.8).
- [ ] **RG4** Per person per day: worked hours, short flag, overtime (RC4) as decimal hours and `h:mm`,
      Day / Night category, over-18 h warning.
- [ ] **RG5** Overtime approval (`overtime.approve`): approve / revoke a person's day, storing the
      approved minutes; audit; "changed since approval" when corrections move the computed value.
- [ ] **RG6** EN + AR; all times Damascus in `<bdi>`.

**Checkpoint RG:** a night shift's check-in at 18:50 and check-out at 07:05 next day count for the
night's date; a person with no check-in 20 min after start shows missing; an absence hides them from
missing; a correction keeps the original event and shows the new one; a 07:00 check-in and 21:10
check-out (with a 1 h break) shows 2.25 h (2:15) of Day overtime; an extra Day shift on an off day
worked 07:00–19:00 shows 12 h; an approval followed by a correction shows "changed since approval"; an
operations manager posting attendance or an overtime approval gets 403.

## Phase RH — Daily attendance report ⏳

- [ ] **RH1** `/reports/attendance?date=&team=`: per team and shift: scheduled, present, late, missing,
      absent, off, unscheduled; per person worked hours and overtime (Day / Night, approved / pending).
      `report.read`.
- [ ] **RH2** Reconciliation: report totals equal the events and absences for that date (a query in the
      checkpoint); history stays the same after a later pattern change, shift-time change or team move.
- [ ] **RH3** Print stylesheet; EN + AR.

**Checkpoint RH:** the report for a test day matches the events entered in RG by hand; changing the
team's pattern or the shift times afterwards doesn't change that day's report.

## Phase RI — Integration, import & hardening ⏳

- [ ] **RI1** Flight assignment (OPERATIONS Phase F) pre-checks the team's roster: warn when the
      handling window falls on the team's off day or outside its shift.
- [ ] **RI2** Staff import: team column → membership effective on the commit date (or a date column, per
      RA1); re-check the import against the new model, then resume OPERATIONS Checkpoint D.
- [ ] **RI3** Security pass: every roster, attendance, overtime and settings load / action checks its
      permission (a viewer gets 403), no `staff.team_id` left; CLAUDE.md §4 / §7 final; `pnpm check`,
      ESLint, Prettier, Svelte autofixer, `pnpm build`.

**Checkpoint RI:** full flow in EN and AR: set shift times → set a team's cycle → add supervisors to the
list → move an employee with a date → record a day with overtime → approve it → the report reconciles;
then OPERATIONS Checkpoint D passes.

## Later (owner; not in RA–RI)

- Supervisor accounts and rights: sign-in (`ACCOUNT_ROLES` + `AUTH_PLAN.md`), recording attendance for
  the teams they supervise only (`requireTeamAccess`), supervisor nav. The former Phase RF.
- Team alignment: staggering several teams' anchors on one cycle so every Day and Night is covered.
- Coverage targets per shift or function.
- Saved named rotations (presets), if copying patterns isn't enough.
- Public holidays as an overtime category.
- Overtime export to Odoo / payroll, and locking a period once exported.

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
