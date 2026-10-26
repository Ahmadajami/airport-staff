import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/schemas/auth.schema.js';

// Admin / operations-manager accounts only. Employees sign in with issued codes they can't change.
// The "must not contain your ID" rule needs the account, so the action checks it too.
export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, { error: () => m.change_password_current_required() }),
		newPassword: z
			.string()
			.min(PASSWORD_MIN_LENGTH, {
				error: () => m.change_password_too_short({ min: PASSWORD_MIN_LENGTH })
			})
			.max(PASSWORD_MAX_LENGTH, {
				error: () => m.change_password_too_long({ max: PASSWORD_MAX_LENGTH })
			}),
		confirmPassword: z.string()
	})
	.superRefine((data, ctx) => {
		if (data.newPassword && data.newPassword === data.currentPassword) {
			ctx.addIssue({ code: 'custom', path: ['newPassword'], message: m.change_password_same() });
		}
		if (data.confirmPassword !== data.newPassword) {
			ctx.addIssue({
				code: 'custom',
				path: ['confirmPassword'],
				message: m.change_password_mismatch()
			});
		}
	});

export type ChangePasswordSchema = typeof changePasswordSchema;
