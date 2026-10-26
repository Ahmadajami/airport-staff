import { DateFormatter } from '@internationalized/date';
import { getLocale } from '#lib/paraglide/runtime.js';

/** Airport time zone: every instant is shown in Damascus time, whatever the device's zone (CLAUDE.md §6.4). */
export const AIRPORT_TIME_ZONE = 'Asia/Damascus';

/** `26 Oct 2026, 13:17` in Damascus time, in the current locale. Wrap the result in `<bdi>`. */
export function formatDateTime(date: Date): string {
	return new DateFormatter(getLocale(), {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: AIRPORT_TIME_ZONE
	}).format(date);
}
