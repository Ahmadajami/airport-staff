// Keep in sync with the RBAC seed migrations in `drizzle/`: adding a key means changing this file
// and adding a new seed migration (CLAUDE.md §7).

export const PERMISSIONS = [
	'flight.read',
	'flight.write',
	'assignment.write',
	'attendance.record',
	'staff.write',
	'import.run',
	'report.read',
	'user.manage',
	'user.manage_operational',
	'user.issue_code',
	'settings.manage',
	'audit.read'
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
	'admin',
	'operations_manager',
	'supervisor',
	'dispatcher',
	'viewer'
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles that sign in with an issued 6-digit code they can't change; the rest use a password. */
export const CODE_ROLES = [
	'supervisor',
	'dispatcher',
	'viewer'
] as const satisfies readonly RoleKey[];

/**
 * Roles whose accounts a holder of each user-management permission may act on.
 * - `user.manage` / `user.manage_operational`: create, deactivate, or move between (a role change
 *   needs both the current and the new role in the list).
 * - `user.issue_code`: issue a new 6-digit code (never for your own account).
 */
export const MANAGEABLE_ROLES = {
	'user.manage': ROLE_KEYS,
	'user.manage_operational': CODE_ROLES,
	'user.issue_code': CODE_ROLES
} as const satisfies Partial<Record<PermissionKey, readonly RoleKey[]>>;
