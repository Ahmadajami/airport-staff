<script lang="ts">
	import type { LayoutProps } from './$types';
	import Header from '#lib/app/layout/Header.svelte';

	let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col">
	<Header />
	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
		{@render children()}
	</main>
</div>
