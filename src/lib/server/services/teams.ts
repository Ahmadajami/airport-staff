import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { auditInsert } from '#lib/server/audit.js';
import { m } from '#lib/paraglide/messages.js';
import { db } from '#lib/server/db/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '#lib/server/errors.js';
import { flight, staff, team, teamFlightAssignment } from '#lib/server/db/schema/index.js';
import { damascusDayRange } from '#lib/server/time.js';
import { pgErrorCode, type Actor } from './common.js';
import { closeTeamMemberships } from './membership.js';

export type TeamInput = { nameEn: string; nameAr: string };

export type TeamListItem = {
	id: string;
	nameEn: string;
	nameAr: string;
	active: boolean;
	memberCount: number;
	todayFlights: number;
};

function requireStaffWrite(actor: Actor) {
	if (!actor.permissions.has('staff.write')) throw new ForbiddenError();
}

async function findTeam(id: string) {
	const row = await db.query.team.findFirst({ where: eq(team.id, id) });
	if (!row) throw new NotFoundError(m.teams_error_not_found());
	return row;
}

/** Teams with their active member count and the number of flights assigned today (Damascus). */
export async function listTeams(actor: Actor, day?: string): Promise<TeamListItem[]> {
	requireStaffWrite(actor);
	const range = damascusDayRange(day);

	const [teams, members, flights] = await Promise.all([
		db.select().from(team).orderBy(asc(team.nameEn)),
		db
			.select({ teamId: staff.teamId, count: sql<number>`count(*)`.mapWith(Number) })
			.from(staff)
			.where(and(eq(staff.active, true), isNotNull(staff.teamId)))
			.groupBy(staff.teamId),
		db
			.select({
				teamId: teamFlightAssignment.teamId,
				count: sql<number>`count(distinct ${teamFlightAssignment.flightId})`.mapWith(Number)
			})
			.from(teamFlightAssignment)
			.innerJoin(flight, eq(flight.id, teamFlightAssignment.flightId))
			.where(
				and(
					eq(teamFlightAssignment.status, 'assigned'),
					gte(flight.scheduledAt, range.start),
					lt(flight.scheduledAt, range.end)
				)
			)
			.groupBy(teamFlightAssignment.teamId)
	]);

	const memberByTeam = new Map(members.map((row) => [row.teamId, row.count]));
	const flightByTeam = new Map(flights.map((row) => [row.teamId, row.count]));

	return teams.map((row) => ({
		...row,
		memberCount: memberByTeam.get(row.id) ?? 0,
		todayFlights: flightByTeam.get(row.id) ?? 0
	}));
}

export async function createTeam(actor: Actor, input: TeamInput) {
	requireStaffWrite(actor);
	const id = randomUUID();

	try {
		await db.batch([
			db.insert(team).values({ id, nameEn: input.nameEn, nameAr: input.nameAr }),
			auditInsert({
				actor: actor.user,
				action: 'team.create',
				entityType: 'team',
				entityId: id,
				after: input
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_name', m.teams_error_duplicate(), {
				field: 'nameEn',
				cause: error
			});
		throw error;
	}

	return { id, ...input, active: true };
}

export async function renameTeam(actor: Actor, id: string, input: TeamInput) {
	requireStaffWrite(actor);
	const before = await findTeam(id);

	try {
		await db.batch([
			db.update(team).set(input).where(eq(team.id, id)),
			auditInsert({
				actor: actor.user,
				action: 'team.rename',
				entityType: 'team',
				entityId: id,
				before: { nameEn: before.nameEn, nameAr: before.nameAr },
				after: input
			})
		]);
	} catch (error) {
		if (pgErrorCode(error) === '23505')
			throw new ConflictError('duplicate_name', m.teams_error_duplicate(), {
				field: 'nameEn',
				cause: error
			});
		throw error;
	}

	return { ...before, ...input };
}

/**
 * Deactivating is blocked while the team still has a future active assignment, and clears the
 * team of its members. Never hard-deletes (CLAUDE.md §6.6).
 */
export async function setTeamActive(actor: Actor, id: string, active: boolean) {
	requireStaffWrite(actor);
	const before = await findTeam(id);
	if (before.active === active) return before;

	let memberCount = 0;
	if (!active) {
		const [row] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(teamFlightAssignment)
			.where(
				and(
					eq(teamFlightAssignment.teamId, id),
					eq(teamFlightAssignment.status, 'assigned'),
					gt(teamFlightAssignment.endsAt, new Date())
				)
			);
		if (row.count > 0) {
			throw new ConflictError('has_future_assignments', m.teams_error_future_assignments());
		}

		const [members] = await db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(staff)
			.where(and(eq(staff.teamId, id), eq(staff.active, true)));
		memberCount = members.count;
	}

	await db.batch([
		db.update(team).set({ active }).where(eq(team.id, id)),
		...(active
			? []
			: [
					db.update(staff).set({ teamId: null }).where(eq(staff.teamId, id)),
					closeTeamMemberships(id, new Date())
				]),
		auditInsert({
			actor: actor.user,
			action: active ? 'team.activate' : 'team.deactivate',
			entityType: 'team',
			entityId: id,
			before: { active: before.active },
			after: { active, membersUnassigned: active ? 0 : memberCount }
		})
	]);

	return { ...before, active };
}
