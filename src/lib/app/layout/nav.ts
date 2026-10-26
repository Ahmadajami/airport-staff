import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFourIcon';
import UserGearIcon from 'phosphor-svelte/lib/UserGearIcon';
import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
import type { AppPath } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';

export type NavItem = {
	path: AppPath;
	/** A function so the label follows the current locale. */
	label: () => string;
	icon: typeof SquaresFourIcon;
	/** Hide the link without this permission. Cosmetic only: the route checks it on the server. */
	permission?: PermissionKey;
};

/** Sidebar navigation for the `(dashboard)` area. */
export const dashboardNav: NavItem[] = [
	{ path: '/dashboard', label: m.nav_dashboard, icon: SquaresFourIcon },
	{ path: '/employees', label: m.nav_employees, icon: UsersThreeIcon },
	{ path: '/admin/users', label: m.nav_users, icon: UserGearIcon, permission: 'user.manage' }
];
