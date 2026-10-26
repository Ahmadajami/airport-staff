import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { bearerToken, verifyAccessToken } from '#lib/server/auth/jwt.js';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	sessionIdFromToken,
	setSessionCookie,
	validateSession
} from '#lib/server/auth/session.js';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

/**
 * Resolves the caller to a session, the same way for both transports:
 * - `Authorization: Bearer <jwt>` (CSR / mobile): verify the access JWT, then load its `sid`
 *   (must be an `api` session). The cookie is ignored on these requests.
 * - otherwise the `session` cookie (SSR): hash the token, load it (must be a `web` session).
 * This only identifies the caller; loads and actions still call `requirePermission()`.
 */
const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.permissions = new Set();
	event.locals.authMethod = null;

	const bearer = bearerToken(event.request);
	if (bearer) {
		const claims = await verifyAccessToken(bearer);
		const result = claims && (await validateSession(claims.sessionId, 'api'));
		if (result && result.user.id === claims.userId) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			event.locals.permissions = result.permissions;
			event.locals.authMethod = 'bearer';
		}
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const result = await validateSession(sessionIdFromToken(token), 'web');
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			event.locals.permissions = result.permissions;
			event.locals.authMethod = 'cookie';
			if (result.renewed) setSessionCookie(event.cookies, token, result.session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	return resolve(event);
};

/**
 * Baseline security headers on every response. Framing is denied so no other site can overlay
 * the admin screens (e.g. issuing sign-in codes); HSTS only outside dev, where there is no HTTPS.
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers: Record<string, string> = {
		'x-frame-options': 'DENY',
		'content-security-policy': "frame-ancestors 'none'",
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'strict-origin-when-cross-origin'
	};
	if (!dev) headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
	for (const [name, value] of Object.entries(headers)) {
		// Redirects and some responses come with immutable headers; skip those quietly.
		try {
			response.headers.set(name, value);
		} catch {
			break;
		}
	}
	return response;
};

export const handle: Handle = sequence(handleSecurityHeaders, handleParaglide, handleAuth);
