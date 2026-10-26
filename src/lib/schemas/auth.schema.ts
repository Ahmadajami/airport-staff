import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

/** Western (0-9), Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits. */
export const ID_DIGITS = /^[0-9٠-٩۰-۹]+$/;

/** Convert Arabic-Indic digits to ASCII so `١٢٣` and `123` are the same ID. */
export function toAsciiDigits(value: string): string {
	return value.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/** Every account signs in with an issued numeric code of this length, entered with the OTP input. */
export const CODE_LENGTH = 6;

// Error messages are functions so they render in the request's locale, not the module-load one.
export const loginSchema = z.object({
	idNumber: z
		.string()
		.trim()
		.min(1, { error: () => m.login_id_required(), abort: true })
		.regex(ID_DIGITS, { error: () => m.login_id_digits() })
		.overwrite(toAsciiDigits),
	password: z
		.string()
		.min(1, { error: () => m.login_password_required(), abort: true })
		.length(CODE_LENGTH, {
			error: () => m.login_password_length({ length: CODE_LENGTH }),
			abort: true
		})
		.regex(ID_DIGITS, { error: () => m.login_password_digits() })
		.overwrite(toAsciiDigits)
});

export type LoginSchema = typeof loginSchema;
