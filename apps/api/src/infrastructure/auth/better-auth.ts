import type { Db } from '@job-pilot/db/client';
import { account, session, user, verification } from '@job-pilot/db/schema/auth';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { DevSessionIssuer } from '../../application/ports/dev-session-issuer.ts';
import type { SessionReader } from '../../application/ports/session-reader.ts';
import type { Env } from '../../env.ts';

type AuthEnv = Pick<
  Env,
  'BETTER_AUTH_SECRET' | 'WEB_URL' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'
>;

/**
 * Better Auth options. Exported separately so tests can build an instance with extra plugins (`testUtils`).
 * - Google only, redirect flow (no pop-up → E02 is not needed).
 * - uuid ids to match the Drizzle schema.
 * - `baseURL` is the web origin: the browser talks to the api only through Next rewrites.
 */
export const createAuthOptions = ({
  db,
  env,
  basePath,
}: {
  db: Db;
  env: AuthEnv;
  basePath: string;
}) => {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account' as const,
          },
        }
      : undefined;

  return {
    appName: 'JobPilot',
    baseURL: env.WEB_URL,
    basePath,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: { enabled: false },
    socialProviders: google ?? {},
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh expiry at most once a day
    },
  } satisfies BetterAuthOptions;
};

export const createAuth = (deps: Parameters<typeof createAuthOptions>[0]) =>
  betterAuth(createAuthOptions(deps));

/** The part of a Better Auth instance the api uses (any instance, incl. test ones with extra plugins). */
export type AuthInstance = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (input: {
      headers: Headers;
    }) => Promise<{ user: { id: string; email: string; name: string } } | null>;
  };
};

export const createSessionReader = (auth: AuthInstance): SessionReader => ({
  read: async (headers) => {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    const { id, email, name } = result.user;
    return { id, email, name };
  },
});

/**
 * Development-only session issuer: a separate Better Auth instance with the `testUtils` plugin (same DB and secret,
 * so its cookies are valid for the real instance). Better Auth recommends keeping testUtils out of the main instance.
 */
export const createDevSessionIssuer = (
  deps: Parameters<typeof createAuthOptions>[0],
): DevSessionIssuer => {
  const devAuth = betterAuth({ ...createAuthOptions(deps), plugins: [testUtils()] });
  return {
    issue: async (email) => {
      const [row] = await deps.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (!row) return null;
      const { cookies } = await (await devAuth.$context).test.login({ userId: row.id });
      return cookies.map(({ name, value }) => ({ name, value }));
    },
  };
};
