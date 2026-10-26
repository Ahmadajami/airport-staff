import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

/** Western (0-9), Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits. */
export const ID_DIGITS = /^[0-9٠-٩۰-۹]+$/;

/** Convert Arabic-Indic digits to ASCII so `١٢٣` and `123` are the same ID. */
export function toAsciiDigits(value: string): string {
	return value.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

/** Employees sign in with an issued numeric code of this length, entered with the OTP input. */
export const CODE_LENGTH = 6;

/** Admin / manager passwords. The max keeps the Argon2 input bounded. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * `code`: the 6-digit code issued to employees (default). `password`: admin / manager password.
 * The mode only shapes the input and its validation; the server checks the secret against the
 * account whatever the mode, so it never reveals which kind an ID uses.
 */
export const LOGIN_MODES = ['code', 'password'] as const;
export type LoginMode = (typeof LOGIN_MODES)[number];

// Error messages are functions so they render in the request's locale, not the module-load one.
export const loginSchema = z
	.object({
		idNumber: z
			.string()
			.trim()
			.min(1, { error: () => m.login_id_required(), abort: true })
			.regex(ID_DIGITS, { error: () => m.login_id_digits() })
			.overwrite(toAsciiDigits),
		mode: z.enum(LOGIN_MODES).default('code'),
		password: z
			.string()
			.min(1, { error: () => m.login_password_required(), abort: true })
			.max(PASSWORD_MAX_LENGTH, { error: () => m.login_password_required() })
	})
	.superRefine((data, ctx) => {
		if (data.mode !== 'code' || !data.password) return;
		if (data.password.length !== CODE_LENGTH) {
			ctx.addIssue({
				code: 'custom',
				path: ['password'],
				message: m.login_password_length({ length: CODE_LENGTH })
			});
		} else if (!ID_DIGITS.test(data.password)) {
			ctx.addIssue({ code: 'custom', path: ['password'], message: m.login_password_digits() });
		}
	});

export type LoginSchema = typeof loginSchema;
