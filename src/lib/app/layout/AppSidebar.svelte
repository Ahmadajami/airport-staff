<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import AirplaneTiltIcon from 'phosphor-svelte/lib/AirplaneTiltIcon';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { localizedHref } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';
	import { dashboardNav } from './nav.js';
	import NavMain from './NavMain.svelte';

	let { ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const sidebar = Sidebar.useSidebar();
	// Desktop: `left` is the logical start, so it mirrors under dir="rtl" on its own.
	// Mobile: the Sheet uses physical sides, so pick one from the text direction.
	const rtl = getTextDirection(getLocale()) === 'rtl';
	const side = $derived(sidebar.isMobile ? (rtl ? 'right' : 'left') : undefined);
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps} {side}>
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
