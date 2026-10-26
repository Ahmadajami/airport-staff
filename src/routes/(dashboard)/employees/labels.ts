import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { Employee, StaffFunction, Team } from './data.js';

/** Droppable id of the "All employees" table; team tables use the team id. */
export const ALL_EMPLOYEES = 'all';

export const functionLabels: Record<StaffFunction, () => string> = {
	ramp: m.function_ramp,
	baggage: m.function_baggage,
	check_in: m.function_check_in,
	gate: m.function_gate
};

export function employeeName(employee: Employee): string {
	return getLocale() === 'ar' ? employee.fullNameAr : employee.fullName;
}

export function teamName(team: Team): string {
	return getLocale() === 'ar' ? team.nameAr : team.nameEn;
}
