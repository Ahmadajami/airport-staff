<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import AppSidebar from '#lib/app/layout/AppSidebar.svelte';
	import SiteHeader from '#lib/app/layout/SiteHeader.svelte';
	import { getLocale, getTextDirection } from '#lib/paraglide/runtime.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The sidebar only takes a physical side, so mirror it for RTL locales.
	const side = getTextDirection(getLocale()) === 'rtl' ? 'right' : 'left';
</script>

<Sidebar.Provider
	style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
	<AppSidebar variant="inset" {side} />
	<Sidebar.Inset>
		<SiteHeader />
		<main class="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
