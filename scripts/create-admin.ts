/**
 * Create an admin account from the command line (first admin, or a recovery admin with --force).
 *
 *   pnpm auth:create-admin <loginId> "<full name>" [--name-ar "<الاسم>"] [--force]
 *
 * Prints a random one-time password once. The admin must change it at first sign-in.
 * Runs outside SvelteKit, so it uses its own DB client and relative imports (no `$app/*`, no `#lib`).
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { generateTempPassword, hashPassword } from '../src/lib/server/auth/password.js';
import * as schema from '../src/lib/server/db/schema/index.js';

const USAGE =
	'Usage: pnpm auth:create-admin <loginId> "<full name>" [--name-ar "<name>"] [--force]';

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		'name-ar': { type: 'string' },
		force: { type: 'boolean', default: false }
	}
});

const [rawLoginId, rawFullName] = positionals;
if (!rawLoginId || !rawFullName?.trim()) fail(USAGE);

// Same normalisation as the login form: Arabic-Indic digits → ASCII.
const loginId = rawLoginId.trim().replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
if (!/^[0-9]+$/.test(loginId)) fail(`loginId must contain digits only (got "${rawLoginId}").`);

const fullName = rawFullName.trim();
const fullNameAr = values['name-ar']?.trim() || null;

const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set.');

const db = drizzle(neon(url), { schema });

const adminRole = await db.query.role.findFirst({
	where: eq(schema.role.key, 'admin'),
	columns: { id: true }
});
if (!adminRole) fail('Role "admin" not found. Run `pnpm db:migrate` first.');

const existingAdmin = await db.query.user.findFirst({
	where: and(eq(schema.user.roleId, adminRole.id), eq(schema.user.active, true)),
	columns: { loginId: true }
});
if (existingAdmin && !values.force) {
	fail(`An active admin already exists (ID ${existingAdmin.loginId}). Use --force to add another.`);
}

const taken = await db.query.user.findFirst({
	where: eq(schema.user.loginId, loginId),
	columns: { id: true }
});
if (taken) fail(`ID ${loginId} already has an account.`);

const oneTimePassword = generateTempPassword();
const id = randomUUID();

await db.batch([
	db.insert(schema.user).values({
		id,
		loginId,
		fullName,
		fullNameAr,
		roleId: adminRole.id,
		passwordHash: await hashPassword(oneTimePassword),
		mustChangePassword: true
	}),
	db.insert(schema.auditLog).values({
		actorUserId: null,
		action: 'user.bootstrap_admin',
		entityType: 'user',
		entityId: id,
		after: { loginId, fullName, fullNameAr, role: 'admin', forced: values.force }
	})
]);

console.log(`
Admin account created.

  ID number:          ${loginId}
  Name:               ${fullName}
  One-time password:  ${oneTimePassword}

This password is shown only once. Sign in at /login; you will be asked to set a new password.
`);
