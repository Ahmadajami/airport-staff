<script lang="ts">
	import { useDraggable } from '@dnd-kit-svelte/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Employee } from './data.js';
	import DragHandle from './DragHandle.svelte';
	import { employeeName, functionLabels } from './labels.js';

	let {
		employee,
		from,
		team
	}: {
		employee: Employee;
		/** Id of the table this row is rendered in: `ALL_EMPLOYEES` or a team id. */
		from: string;
		/** Team cell for the All table: the team's name, `null` for no team, omitted to hide the column. */
		team?: string | null;
	} = $props();

	const name = $derived(employeeName(employee));

	// The same employee can be listed in All and in a team, so the draggable id includes the table.
	const { ref, handleRef, isDragging } = useDraggable({
		id: () => `${from}:${employee.id}`,
		type: 'employee',
		data: () => ({ employeeId: employee.id, from })
	});
</script>

<Table.Row {@attach ref} data-dragging={isDragging.current} class="data-[dragging=true]:opacity-40">
	<Table.Cell class="w-8 pe-0">
		<DragHandle attach={handleRef} label={m.drag_handle_label({ name })} />
	</Table.Cell>
	<Table.Cell class="font-mono text-muted-foreground">
		<bdi dir="ltr">{employee.employeeNo}</bdi>
	</Table.Cell>
	<Table.Cell class="font-medium">{name}</Table.Cell>
	<Table.Cell>
		<Badge variant="outline">{functionLabels[employee.function]()}</Badge>
	</Table.Cell>
	{#if team !== undefined}
		<Table.Cell class={team === null ? 'text-muted-foreground' : undefined}>
			{team ?? m.employees_no_team()}
		</Table.Cell>
	{/if}
</Table.Row>
