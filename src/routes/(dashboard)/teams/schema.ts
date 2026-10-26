import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';

export const teamFormSchema = z.object({
	teamId: z.union([z.literal(''), z.uuid()]).default(''),
	nameEn: z
		.string()
		.trim()
		.min(1, { error: () => m.teams_name_required() })
		.max(120),
	nameAr: z
		.string()
		.trim()
		.min(1, { error: () => m.teams_name_required() })
		.max(120)
});

export const setTeamActiveSchema = z.object({
	teamId: z.uuid(),
	active: z.enum(['true', 'false'])
});

/** Superforms status message for the create / rename sheet. */
export type TeamMessage = { kind: 'success' | 'error'; text: string };
