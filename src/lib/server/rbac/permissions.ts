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

/**
 * Roles whose accounts a holder of each user-management permission may create, reset, deactivate,
 * or move between. A role change needs both the current and the new role in the list.
 */
export const MANAGEABLE_ROLES = {
	'user.manage': ROLE_KEYS,
	'user.manage_operational': ['supervisor', 'dispatcher', 'viewer']
} as const satisfies Partial<Record<PermissionKey, readonly RoleKey[]>>;
