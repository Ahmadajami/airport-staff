import { randomInt } from 'node:crypto';
import { CODE_LENGTH } from '#lib/schemas/auth.schema.js';
import { CODE_ROLES, type RoleKey } from '#lib/server/rbac/permissions.js';

// Credential policy (AUTH_PLAN.md, "Decisions"):
// - `code`: supervisor / dispatcher / viewer sign in with an issued 6-digit code. It expires, the
//   employee can't change it, and too many consecutive wrong codes lock the account.
// - `password`: admin / operations_manager use a long password they set after a one-time password.

export type CredentialKind = 'code' | 'password';

/** Validity choices offered when issuing a code. Open question with the ops team. */
export const CODE_VALIDITY_HOURS = [12, 24, 72] as const;
export type CodeValidityHours = (typeof CODE_VALIDITY_HOURS)[number];
export const DEFAULT_CODE_VALIDITY_HOURS: CodeValidityHours = 24;

/** Consecutive wrong codes before a code account is locked (until a new code is issued). */
export const MAX_CONSECUTIVE_CODE_FAILURES = 5;

export function credentialKindForRole(role: RoleKey): CredentialKind {
	return (CODE_ROLES as readonly RoleKey[]).includes(role) ? 'code' : 'password';
}

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
