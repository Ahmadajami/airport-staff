import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
// Relative, not #lib: scripts/create-admin.ts imports this file outside SvelteKit.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../schemas/auth.schema.js';

// OWASP baseline for Argon2id (19 MiB, 2 iterations, 1 lane). Argon2id is the library default.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const TEMP_PASSWORD_LENGTH = 12;
// No 0/O, 1/l/I: the one-time password is read out or copied by hand.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		// Malformed hash: treat as a failed match rather than a 500.
		return false;
	}
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same Argon2 time as a real check when the login ID doesn't exist (or is inactive), so
 * response timing doesn't reveal which employee IDs have accounts. Always resolves to `false`.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
	dummyHash ??= hashPassword('dummy-password-for-timing');
	await verifyPassword(await dummyHash, password);
	return false;
}

/** Random one-time password handed to the employee by the Admin / Operations Manager. */
export function generateTempPassword(): string {
	let password = '';
	for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
		password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
	}
	return password;
}

export type PasswordProblem = 'too_short' | 'too_long' | 'contains_login_id';

/** Rules for a password the user chooses. Empty array = acceptable. */
export function passwordProblems(password: string, loginId: string): PasswordProblem[] {
	const problems: PasswordProblem[] = [];
	if (password.length < PASSWORD_MIN_LENGTH) problems.push('too_short');
	if (password.length > PASSWORD_MAX_LENGTH) problems.push('too_long');
	if (loginId && password.includes(loginId)) problems.push('contains_login_id');
	return problems;
}
