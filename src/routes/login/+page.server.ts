import { fail, message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import { loginSchema } from '#lib/schemas/auth.schema.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod4(loginSchema));
		// Never send the password back to the browser.
		form.data.password = '';

		if (!form.valid) return fail(400, { form });

		// TODO(auth): verify form.data.idNumber (ASCII digits) + password once the auth library
		// is chosen (CLAUDE.md §8), then create the session and redirect to localizedHref('/').
		return message(form, m.login_not_configured(), { status: 501 });
	}
};
