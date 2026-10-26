<script lang="ts">
	import { untrack } from 'svelte';
	import { DragDropProvider, DragOverlay, type DragDropEvents } from '@dnd-kit-svelte/svelte';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import EmployeesTable from './EmployeesTable.svelte';
	import TeamTable from './TeamTable.svelte';
	import { ALL_EMPLOYEES, employeeName, teamName } from './labels.js';

	let { data }: PageProps = $props();

	// Client-only for now: team changes are lost on reload until the staff service exists.
	let employees = $state(untrack(() => data.employees.map((e) => ({ ...e }))));

	const teams = $derived(data.teams);
	const teamById = $derived(new Map(teams.map((t) => [t.id, t])));
	const employeeById = $derived(new Map(employees.map((e) => [e.id, e])));
	const membersByTeam = $derived(
		Object.fromEntries(
			teams.map((t) => [
				t.id,
				employees
					.filter((e) => e.teamId === t.id)
					.sort((a, b) => employeeName(a).localeCompare(employeeName(b)))
			])
		)
	);

	const handleDragEnd: DragDropEvents['dragend'] = (event) => {
		const { source, target } = event.operation;
		if (event.canceled || !source || !target) return;

		const employee = employeeById.get(source.data?.employeeId);
		if (!employee) return;

		const from = source.data?.from;
		const previousTeam = employee.teamId ? teamById.get(employee.teamId) : undefined;

		if (target.id === ALL_EMPLOYEES) {
			// Only a team table can unassign; an All row dropped back on All is a no-op.
			if (from === ALL_EMPLOYEES || !previousTeam) return;
			employee.teamId = null;
			toast.success(
				m.employees_unassigned({ name: employeeName(employee), team: teamName(previousTeam) })
			);
			return;
		}

		const nextTeam = teamById.get(String(target.id));
		if (!nextTeam || nextTeam.id === employee.teamId) return;
		employee.teamId = nextTeam.id;
		toast.success(m.employees_moved({ name: employeeName(employee), team: teamName(nextTeam) }));
	};
</script>

<svelte:head>
	<title>{m.employees_title()} · {m.app_name()}</title>
</svelte:head>

<section class="flex flex-col gap-1">
	<h2 class="text-2xl font-semibold tracking-tight">{m.employees_title()}</h2>
	<p class="max-w-prose text-muted-foreground">{m.employees_description()}</p>
</section>

<DragDropProvider onDragEnd={handleDragEnd}>
	<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
		<EmployeesTable
			{employees}
			{teamById}
			class="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-var(--header-height)-4rem)]"
		/>

		<section aria-labelledby="teams-heading" class="flex flex-col gap-4">
			<h3 id="teams-heading" class="text-sm font-medium text-muted-foreground">
				{m.employees_teams()}
			</h3>
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
				{#each teams as team (team.id)}
					<TeamTable {team} members={membersByTeam[team.id]} />
				{/each}
			</div>
		</section>
	</div>

	<DragOverlay>
		{#snippet children(source)}
			{@const employee = employeeById.get(source.data?.employeeId)}
			{#if employee}
				<div class="bg-popover px-3 py-2 text-xs font-medium shadow-lg ring-1 ring-foreground/10">
					{employeeName(employee)}
					<bdi dir="ltr" class="ms-2 font-mono text-muted-foreground">{employee.employeeNo}</bdi>
				</div>
			{/if}
		{/snippet}
	</DragOverlay>
</DragDropProvider>
