<script lang="ts">
	import './layout.css';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import Header from '#lib/app/layout/Header.svelte';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<Toaster />
<Header />
<main>
	{@render children()}
</main>
