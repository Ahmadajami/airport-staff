import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { fail, message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { localizedHref } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#lib/schemas/auth.schema.js';
import { auditInsert } from '#lib/server/audit.js';
import {
	hashPassword,
	passwordProblems,
	verifyPassword,
	type PasswordProblem
} from '#lib/server/auth/password.js';
import { isLoginRateLimited, recordLoginAttempt } from '#lib/server/auth/rate-limit.js';
import { invalidateUserSessions, requestMeta } from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema/index.js';
import { requireUser } from '#lib/server/rbac/guard.js';
import { changePasswordSchema } from './schema.js';
import type { Actions, PageServerLoad } from './$types';

const PROBLEM_TEXT: Record<PasswordProblem, () => string> = {
	too_short: () => m.change_password_too_short({ min: PASSWORD_MIN_LENGTH }),
	too_long: () => m.change_password_too_long({ max: PASSWORD_MAX_LENGTH }),
	contains_login_id: () => m.change_password_contains_id()
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, localizedHref('/login'));
	// Code accounts (supervisor / dispatcher / viewer) can't change their issued code.
	if (locals.user.credential === 'code') error(404);
	return {
		form: await superValidate(zod4(changePasswordSchema)),
		required: locals.user.mustChangePassword
	};
};

export const actions: Actions = {
	default: async (event) => {
		const actor = requireUser(event.locals);
		if (actor.credential === 'code') error(404);

		const form = await superValidate(event.request, zod4(changePasswordSchema));
		const { currentPassword, newPassword } = form.data;
		// Never send passwords back to the browser.
		form.data = { currentPassword: '', newPassword: '', confirmPassword: '' };

		if (!form.valid) return fail(400, { form });

		// A stolen session must not become a way to brute-force the current password.
		const meta = requestMeta(event);
		if (await isLoginRateLimited(actor.loginId, meta.ip)) {
			return message(form, m.login_rate_limited(), { status: 429 });
		}

		const account = await db.query.user.findFirst({
			where: eq(user.id, actor.id),
			columns: { passwordHash: true }
		});
		if (!account || !(await verifyPassword(account.passwordHash, currentPassword))) {
			await recordLoginAttempt({ loginId: actor.loginId, ip: meta.ip, success: false });
			return setError(form, 'currentPassword', m.change_password_current_wrong());
		}

		const problems = passwordProblems(newPassword, actor.loginId);
		if (problems.length) {
			return setError(
				form,
				'newPassword',
				problems.map((p) => PROBLEM_TEXT[p]())
			);
		}

		await db.batch([
			db
				.update(user)
				.set({
					passwordHash: await hashPassword(newPassword),
					mustChangePassword: false,
					passwordChangedAt: new Date(),
					failedLoginCount: 0
				})
				.where(eq(user.id, actor.id)),
			// Sign out every other device; this one stays signed in.
			invalidateUserSessions(actor.id, { except: event.locals.session?.id }),
			auditInsert({
				actor,
				action: 'user.password_change',
				entityType: 'user',
				entityId: actor.id,
				before: { mustChangePassword: actor.mustChangePassword },
				after: { mustChangePassword: false }
			})
		]);

		redirect(303, localizedHref('/'));
	}
};
