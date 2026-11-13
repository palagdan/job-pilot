import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { DevSessionIssuer } from '../../application/ports/dev-session-issuer.ts';
import type { AppEnv } from '../app-env.ts';
import { apiError } from '../errors.ts';
import { validate } from '../validate.ts';

/** Seeded by `pnpm db:seed` (packages/db/src/seed/demo-user.ts). */
const demoUserEmail = 'demo@jobpilot.local';

/** Development only (mounted by createApp when `devSessions` is provided). */
export const createDevRoutes = (devSessions: DevSessionIssuer) =>
  new Hono<AppEnv>().post(
    '/sign-in',
    validate(
      'json',
      z.object({ email: z.email().default(demoUserEmail) }).default({ email: demoUserEmail }),
    ),
    async (c) => {
      const { email } = c.req.valid('json');
      const cookies = await devSessions.issue(email);
      if (!cookies) return apiError(c, 'not_found', `No user ${email}. Run \`pnpm db:seed\`.`);
      for (const { name, value } of cookies) {
        setCookie(c, name, value, { path: '/', httpOnly: true, sameSite: 'Lax' });
      }
      c.var.log.warn('dev sign-in', { email });
      return c.json({ ok: true as const });
    },
  );
