import { error, fail } from '@sveltejs/kit';
import {
	message,
	setError,
	superValidate,
	type Infer,
	type SuperValidated
} from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '#lib/paraglide/messages.js';
import type { CodeValidityHours } from '#lib/schemas/auth.schema.js';
import { requirePermission } from '#lib/server/rbac/guard.js';
import {
	UserServiceError,
	changeAccountRole,
	createAccount,
	issueCode,
	listAccountRoles,
	listAccounts,
	setAccountActive,
	type Actor,
	type UserServiceErrorCode
} from '#lib/server/services/users.js';
import {
	changeRoleSchema,
	createAccountSchema,
	issueCodeSchema,
	setActiveSchema,
	type UsersMessage
} from './schema.js';
import type { Actions, PageServerLoad } from './$types';

const ERROR_TEXT: Record<Exclude<UserServiceErrorCode, 'forbidden'>, () => string> = {
	not_found: () => m.users_error_not_found(),
	duplicate_login_id: () => m.users_error_duplicate(),
	invalid_role: () => m.users_error_role(),
	self: () => m.users_error_self(),
	last_admin: () => m.users_error_last_admin(),
	inactive: () => m.users_error_inactive()
};

function actorFrom(locals: App.Locals): Actor {
	return { user: requirePermission(locals, 'user.manage'), permissions: locals.permissions };
}

/** Service errors → 403 or a form-level error message. Anything else is a bug and rethrows. */
function handleError<T extends Record<string, unknown>>(
	form: SuperValidated<T, UsersMessage>,
	cause: unknown
) {
	if (!(cause instanceof UserServiceError)) throw cause;
	if (cause.code === 'forbidden') error(403, m.auth_forbidden(), { code: 'forbidden' });
	return message(form, { kind: 'error', text: ERROR_TEXT[cause.code]() }, { status: 400 });
}

const toHours = (value: string) => Number(value) as CodeValidityHours;

export const load: PageServerLoad = async ({ locals }) => {
	const actor = actorFrom(locals);
	const [accounts, roles] = await Promise.all([listAccounts(actor), listAccountRoles(actor)]);
	return {
		accounts,
		roles,
		createForm: await superValidate(zod4(createAccountSchema), { id: 'create' }),
		issueForm: await superValidate(zod4(issueCodeSchema), { id: 'issue' }),
		roleForm: await superValidate(zod4(changeRoleSchema), { id: 'role' })
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof createAccountSchema>, UsersMessage>(
			request,
			zod4(createAccountSchema),
			{ id: 'create' }
		);
		if (!form.valid) return fail(400, { form });

		try {
			const issued = await createAccount(actor, {
				loginId: form.data.loginId,
				fullName: form.data.fullName,
				fullNameAr: form.data.fullNameAr || null,
				role: form.data.role,
				validity: toHours(form.data.validity)
			});
			return message(form, {
				kind: 'issued',
				fullName: issued.fullName,
				loginId: form.data.loginId,
				code: issued.code,
				expiresAt: issued.expiresAt.toISOString()
			});
		} catch (cause) {
			if (cause instanceof UserServiceError && cause.code === 'duplicate_login_id') {
				return setError(form, 'loginId', ERROR_TEXT.duplicate_login_id());
			}
			return handleError(form, cause);
		}
	},

	issueCode: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof issueCodeSchema>, UsersMessage>(
			request,
			zod4(issueCodeSchema),
			{ id: 'issue' }
		);
		if (!form.valid) return fail(400, { form });

		try {
			const target = await issueCode(
				actor,
				form.data.userId,
				toHours(form.data.validity),
				locals.session?.id
			);
			return message(form, {
				kind: 'issued',
				fullName: target.fullName,
				loginId: target.loginId,
				code: target.code,
				expiresAt: target.expiresAt.toISOString()
			});
		} catch (cause) {
			return handleError(form, cause);
		}
	},

	changeRole: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const form = await superValidate<Infer<typeof changeRoleSchema>, UsersMessage>(
			request,
			zod4(changeRoleSchema),
			{ id: 'role' }
		);
		if (!form.valid) return fail(400, { form });

		try {
			const target = await changeAccountRole(actor, form.data.userId, form.data.role);
			return message(form, {
				kind: 'success',
				text: m.users_role_changed({ name: target.fullName })
			});
		} catch (cause) {
			return handleError(form, cause);
		}
	},

	setActive: async ({ request, locals }) => {
		const actor = actorFrom(locals);
		const parsed = setActiveSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { notice: m.users_error_not_found() });

		const active = parsed.data.active === 'true';
		try {
			const target = await setAccountActive(actor, parsed.data.userId, active);
			return {
				notice: active
					? m.users_activated({ name: target.fullName })
					: m.users_deactivated({ name: target.fullName })
			};
		} catch (cause) {
			if (!(cause instanceof UserServiceError)) throw cause;
			if (cause.code === 'forbidden') error(403, m.auth_forbidden(), { code: 'forbidden' });
			return fail(400, { notice: ERROR_TEXT[cause.code]() });
		}
	}
};
