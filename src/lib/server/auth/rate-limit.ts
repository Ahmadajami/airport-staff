import { and, eq, gt, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { loginAttempt } from '#lib/server/db/schema/index.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_LOGIN_ID = 5;
const MAX_FAILURES_PER_IP = 20;

/** True when this ID or IP has too many recent failed sign-ins (web login and token API). */
export async function isLoginRateLimited(loginId: string, ip: string | null): Promise<boolean> {
	const since = new Date(Date.now() - WINDOW_MS);
	const [counts] = await db
		.select({
			byLoginId: sql<number>`count(*) filter (where ${loginAttempt.loginId} = ${loginId})`.mapWith(
				Number
			),
			byIp: ip
				? sql<number>`count(*) filter (where ${loginAttempt.ip} = ${ip})`.mapWith(Number)
				: sql<number>`0`.mapWith(Number)
		})
		.from(loginAttempt)
		.where(
			and(
				eq(loginAttempt.success, false),
				gt(loginAttempt.attemptedAt, since),
				ip
					? or(eq(loginAttempt.loginId, loginId), eq(loginAttempt.ip, ip))
					: eq(loginAttempt.loginId, loginId)
			)
		);
	return counts.byLoginId >= MAX_FAILURES_PER_LOGIN_ID || counts.byIp >= MAX_FAILURES_PER_IP;
}

/** Insert query for one attempt. Await it, or pass it to `db.batch([...])`. */
export function recordLoginAttempt(attempt: {
	loginId: string;
	ip: string | null;
	success: boolean;
}) {
	return db.insert(loginAttempt).values(attempt);
}
