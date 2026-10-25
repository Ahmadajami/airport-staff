import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formSchema } from './schema';

export const load: PageServerLoad = async () => {
	// Initialize the form with empty values based on the schema
	const form = await superValidate(zod4(formSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod4(formSchema));

		if (!form.valid) {
			// Return validation errors back to the client
			return fail(400, { form });
		}
		console.log('Form data is valid:', form.data);

		// Form data is valid: form.data contains the typed input
		return { form };
	}
};
