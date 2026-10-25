<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import * as Form from '#lib/components/ui/form/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { formSchema } from './schema';

	const form = superForm(defaults(zod4(formSchema)), {
		validators: zod4(formSchema),
		onUpdate: ({ form: f }) => {
			if (f.valid) {
				toast.success(`Submitted email: ${f.data.email}`);
			} else {
				toast.error('Please enter a valid email address.');
			}
		}
	});

	const { form: formData, enhance } = form;
</script>

<form method="POST" class="w-2/3 space-y-6" use:enhance>
	<Form.Field {form} name="email">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Email</Form.Label>
				<Input
					{...props}
					type="email"
					placeholder="name@example.com"
					bind:value={$formData.email}
				/>
			{/snippet}
		</Form.Control>
		<Form.Description>We'll use this email to send you updates.</Form.Description>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Button>Submit</Form.Button>
</form>
