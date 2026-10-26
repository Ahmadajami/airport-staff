import type { PageServerLoad } from './$types';
import { employees, teams } from './data.js';

export const load: PageServerLoad = async () => {
	// TODO(auth): requirePermission(locals, 'staff.read') and load from the staff service (CLAUDE.md §6.1).
	return { employees, teams };
};
