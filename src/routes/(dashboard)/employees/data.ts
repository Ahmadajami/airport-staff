// Dummy data shaped like the planned `staff` / `team` tables (CLAUDE.md §7).
// Replace with the staff service once the schema exists.

export type StaffFunction = 'ramp' | 'baggage' | 'check_in' | 'gate';

export type Team = {
	id: string;
	nameEn: string;
	nameAr: string;
};

export type Employee = {
	id: string;
	employeeNo: string;
	fullName: string;
	fullNameAr: string;
	phone: string;
	function: StaffFunction;
	teamId: string | null;
};

export const teams: Team[] = [
	{ id: 'team-ramp-a', nameEn: 'Ramp A', nameAr: 'ساحة الطائرات أ' },
	{ id: 'team-baggage-b', nameEn: 'Baggage B', nameAr: 'الأمتعة ب' },
	{ id: 'team-check-in-c', nameEn: 'Check-in C', nameAr: 'تسجيل الوصول ج' },
	{ id: 'team-gate-d', nameEn: 'Gate D', nameAr: 'البوابة د' }
];

type Row = [fullName: string, fullNameAr: string, fn: StaffFunction, teamId: string | null];

const rows: Row[] = [
	['Ahmad Al-Khatib', 'أحمد الخطيب', 'ramp', 'team-ramp-a'],
	['Omar Haddad', 'عمر حداد', 'ramp', 'team-ramp-a'],
	['Khaled Nasser', 'خالد ناصر', 'ramp', 'team-ramp-a'],
	['Yousef Hamwi', 'يوسف الحموي', 'ramp', null],
	['Mahmoud Darwish', 'محمود درويش', 'ramp', null],
	['Samer Shami', 'سامر الشامي', 'baggage', 'team-baggage-b'],
	['Rami Halabi', 'رامي الحلبي', 'baggage', 'team-baggage-b'],
	['Fadi Kurdi', 'فادي الكردي', 'baggage', 'team-baggage-b'],
	['Bassam Ali', 'بسام علي', 'baggage', null],
	['Hussam Saleh', 'حسام صالح', 'baggage', null],
	['Lina Mansour', 'لينا منصور', 'check_in', 'team-check-in-c'],
	['Rania Aziz', 'رانيا عزيز', 'check_in', 'team-check-in-c'],
	['Hiba Qassem', 'هبة قاسم', 'check_in', 'team-check-in-c'],
	['Nour Sabbagh', 'نور الصباغ', 'check_in', null],
	['Dima Jaber', 'ديما جابر', 'check_in', null],
	['Sara Atassi', 'سارة الأتاسي', 'check_in', null],
	['Majd Barakat', 'مجد بركات', 'gate', 'team-gate-d'],
	['Rasha Khoury', 'رشا خوري', 'gate', 'team-gate-d'],
	['Tarek Zein', 'طارق زين', 'gate', 'team-gate-d'],
	['Maya Hakim', 'مايا حكيم', 'gate', null],
	['Wael Ibrahim', 'وائل إبراهيم', 'gate', null],
	['Ziad Hamdan', 'زياد حمدان', 'ramp', 'team-ramp-a'],
	['Hala Sukkar', 'هالة سكر', 'baggage', null],
	['Ghassan Issa', 'غسان عيسى', 'ramp', null]
];

export const employees: Employee[] = rows.map(([fullName, fullNameAr, fn, teamId], i) => {
	const n = i + 1;
	return {
		id: `emp-${n}`,
		employeeNo: String(10400 + n),
		fullName,
		fullNameAr,
		phone: `+963 9${(n % 9) + 1}${String(1234567 + n * 7919).slice(-7)}`,
		function: fn,
		teamId
	};
});
