// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthSession, AuthUser } from '#lib/server/auth/session.js';
import type { PermissionKey } from '#lib/server/rbac/permissions.js';

declare global {
	namespace App {
		interface Error {
			/** Stable machine-readable code for API (CSR) clients, e.g. `forbidden`. */
			code?: string;
		}
		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
			/** Empty when signed out. Always check with `requirePermission()` on the server. */
			permissions: ReadonlySet<PermissionKey>;
			/** How this request authenticated: SSR cookie or `Authorization: Bearer` access JWT. */
			authMethod: 'cookie' | 'bearer' | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
