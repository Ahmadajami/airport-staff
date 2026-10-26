import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { AuthUser } from '#lib/server/auth/session.js';
import type { PermissionKey } from './permissions.js';

// Server-side enforcement (CLAUDE.md §6.1). Works the same for cookie (SSR) and Bearer JWT (API)
// requests, because hooks.server.ts fills `locals` identically for both.

/** The signed-in user, or a 401. */
export function requireUser(locals: App.Locals): AuthUser {
	if (!locals.user) error(401, m.auth_unauthenticated(), { code: 'unauthenticated' });
	return locals.user;
}

/**
 * The signed-in user if they hold `key`, otherwise 401/403. Also 403 while the user still has a
 * one-time password: until it is changed, the only things they can do are change it or sign out.
 */
export function requirePermission(locals: App.Locals, key: PermissionKey): AuthUser {
	const user = requireUser(locals);
	if (user.mustChangePassword) {
		error(403, m.auth_password_change_required(), { code: 'password_change_required' });
	}
	if (!locals.permissions.has(key)) error(403, m.auth_forbidden(), { code: 'forbidden' });
	return user;
}

/** For showing/hiding UI only. Never a substitute for `requirePermission` in loads and actions. */
export function hasPermission(locals: App.Locals, key: PermissionKey): boolean {
	return !!locals.user && !locals.user.mustChangePassword && locals.permissions.has(key);
}
