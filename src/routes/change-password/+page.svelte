<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import LockIcon from 'phosphor-svelte/lib/LockIcon';
	import SignOutIcon from 'phosphor-svelte/lib/SignOutIcon';
	import SpinnerGapIcon from 'phosphor-svelte/lib/SpinnerGapIcon';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { PASSWORD_MIN_LENGTH } from '#lib/schemas/auth.schema.js';
	import { formToasts } from '#lib/utils/form-toasts.js';
	import { changePasswordSchema } from './schema.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const form = superForm(
		untrack(() => data.form),
		{ validators: zod4Client(changePasswordSchema), ...formToasts() }
	);
	const { form: formData, enhance, submitting } = form;

	type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';
	const fields: { name: Field; label: () => string; autocomplete: AutoFill }[] = [
		{ name: 'currentPassword', label: m.change_password_current, autocomplete: 'current-password' },
		{ name: 'newPassword', label: m.change_password_new, autocomplete: 'new-password' },
		{ name: 'confirmPassword', label: m.change_password_confirm, autocomplete: 'new-password' }
	];
</script>

<svelte:head>
	<title>{m.change_password_title()} · {m.app_name()}</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center px-4 py-10">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>{m.change_password_title()}</Card.Title>
			<Card.Description>
				{data.required
					? m.change_password_required_description()
					: m.change_password_description({ min: PASSWORD_MIN_LENGTH })}
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" class="space-y-4" use:enhance>
				{#each fields as field (field.name)}
					<Form.Field {form} name={field.name}>
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>{field.label()}</Form.Label>
								<InputGroup.Root>
									<InputGroup.Input
										{...props}
										bind:value={$formData[field.name]}
										type="password"
										autocomplete={field.autocomplete}
										dir="ltr"
									/>
									<InputGroup.Addon align="inline-start">
										<LockIcon />
									</InputGroup.Addon>
								</InputGroup.Root>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				{/each}

				<Form.Button class="w-full" disabled={$submitting}>
					{#if $submitting}
						<SpinnerGapIcon data-icon="inline-start" class="animate-spin" />
					{/if}
					{m.change_password_submit()}
				</Form.Button>
			</form>

			<form method="POST" action={localizedHref('/logout')}>
				<Button type="submit" variant="ghost" class="w-full">
					<SignOutIcon data-icon="inline-start" class="rtl:-scale-x-100" />
					{m.logout()}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</main>
