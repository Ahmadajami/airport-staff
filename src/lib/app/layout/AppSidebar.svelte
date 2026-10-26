<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import AirplaneTiltIcon from 'phosphor-svelte/lib/AirplaneTiltIcon';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { dashboardNav } from './nav.js';
	import NavMain from './NavMain.svelte';

	let { ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:!p-1.5">
					{#snippet child({ props })}
						<a href={localizedHref('/dashboard')} {...props}>
							<AirplaneTiltIcon class="!size-5 rtl:-scale-x-100" weight="duotone" />
							<span class="text-base font-semibold">{m.app_name()}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={dashboardNav} />
	</Sidebar.Content>
</Sidebar.Root>
