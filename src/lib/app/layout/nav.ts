import SquaresFourIcon from 'phosphor-svelte/lib/SquaresFourIcon';
import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
import type { AppPath } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';

export type NavItem = {
	path: AppPath;
	/** A function so the label follows the current locale. */
	label: () => string;
	icon: typeof SquaresFourIcon;
};

/** Sidebar navigation for the `(dashboard)` area. */
export const dashboardNav: NavItem[] = [
	{ path: '/dashboard', label: m.nav_dashboard, icon: SquaresFourIcon },
	{ path: '/employees', label: m.nav_employees, icon: UsersThreeIcon }
];
