import { resolve } from '$app/paths';
import type { ResolvedPathname, RouteId, RouteParams } from '$app/types';
import { localizeHref, type Locale } from '#lib/paraglide/runtime.js';

/** Route ids without dynamic params, e.g. `/` or `/login` (not `/flights/[id]`). */
export type StaticRoute = {
	[R in RouteId]: RouteParams<R> extends Record<string, never> ? R : never;
}[RouteId];

/**
 * Localized, type-checked href for an internal route: `localizeHref(resolve(url))`.
 *
 * `resolve()` checks the route exists and applies the base path, then `localizeHref()` adds the
 * locale prefix (current locale unless `locale` is given). Returns `ResolvedPathname` so
 * `<a href>` passes the `svelte/no-navigation-without-resolve` lint rule.
 *
 * @example localizedHref('/login')        // '/login' or '/ar/login'
 * @example localizedHref('/login', 'ar')  // '/ar/login'
 */
export function localizedHref(url: StaticRoute, locale?: Locale): ResolvedPathname {
	return localizeHref(resolve(url), { locale }) as ResolvedPathname;
}
