import { redirect } from '@sveltejs/kit';
import { fail, message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { localizedHref } from '#lib/i18n.js';
import { m } from '#lib/paraglide/messages.js';
import { loginSchema, toAsciiDigits } from '#lib/schemas/auth.schema.js';
import { authenticate, type LoginFailure } from '#lib/server/auth/login.js';
import { requestMeta, setSessionCookie } from '#lib/server/auth/session.js';
import type { Actions, PageServerLoad } from './$types';

const FAILURE: Record<LoginFailure, { status: 400 | 403 | 429; text: () => string }> = {
	invalid: { status: 400, text: () => m.login_invalid() },
	rate_limited: { status: 429, text: () => m.login_rate_limited() },
	locked: { status: 403, text: () => m.login_locked() },
	code_expired: { status: 403, text: () => m.login_code_expired() }
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, localizedHref(locals.user.mustChangePassword ? '/change-password' : '/'));
	}
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		const { idNumber, mode } = form.data;
		const secret = mode === 'code' ? toAsciiDigits(form.data.password) : form.data.password;
		// Never send the secret back to the browser.
		form.data.password = '';

		if (!form.valid) return fail(400, { form });

		const result = await authenticate(idNumber, secret, 'web', requestMeta(event));
		if (!result.ok) {
			const failure = FAILURE[result.reason];
			return message(form, failure.text(), { status: failure.status });
		}

		setSessionCookie(event.cookies, result.token, result.expiresAt);
		redirect(303, localizedHref(result.mustChangePassword ? '/change-password' : '/'));
	}
};
