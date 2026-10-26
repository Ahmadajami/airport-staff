import { randomInt } from 'node:crypto';
import { CODE_LENGTH } from '#lib/schemas/auth.schema.js';

// Credential policy (AUTH_PLAN.md, "Decisions"): every account signs in with a 6-digit code issued
// by an admin (or `pnpm auth:issue-code`). Codes expire, their holder can't change them, and too
// many consecutive wrong codes lock the account until a new code is issued.

/** Validity choices offered when issuing a code: 24 h, 7 days, 30 days. */
export const CODE_VALIDITY_HOURS = [24, 168, 720] as const;
export type CodeValidityHours = (typeof CODE_VALIDITY_HOURS)[number];
/** Open question with the ops team; 7 days so the three users aren't re-issued codes daily. */
export const DEFAULT_CODE_VALIDITY_HOURS: CodeValidityHours = 168;

/** Consecutive wrong codes before an account is locked (until a new code is issued). */
export const MAX_CONSECUTIVE_CODE_FAILURES = 5;

/** Uniformly random 6-digit code, leading zeros kept (`004217`). */
export function generateCode(): string {
	return randomInt(0, 10 ** CODE_LENGTH)
		.toString()
		.padStart(CODE_LENGTH, '0');
}

export function codeExpiresAt(
	hours: CodeValidityHours = DEFAULT_CODE_VALIDITY_HOURS,
	from: Date = new Date()
): Date {
	return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
