import { verifyUnsubscribeToken } from '@job-pilot/emails/unsubscribe-token';
import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { EmailPreferencesRepository } from '../../application/ports/email-preferences-repository.ts';
import type { AppEnv } from '../app-env.ts';
import { apiError } from '../errors.ts';
import { validate } from '../validate.ts';

const page = (title: string, message: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#F6F7F9;font-family:Inter,Arial,sans-serif;color:#0B0D12;"><main style="max-width:480px;margin:15vh auto;padding:32px;background:#fff;border:1px solid #E4E7EC;border-radius:16px;"><h1 style="margin:0 0 12px;font-size:22px;">${title}</h1><p style="margin:0;line-height:24px;">${message}</p></main></body></html>`;

/**
 * Public, no session. Mail clients POST (one-click, `List-Unsubscribe=One-Click` form body, token in the query);
 * the footer link opens the same URL with GET and gets a small HTML page.
 */
export const createEmailRoutes = (deps: {
  preferences: EmailPreferencesRepository;
  secret: string;
}) =>
  new Hono<AppEnv>()
    .post('/unsubscribe', validate('query', routes.unsubscribeEmail.query), async (c) => {
      const userId = verifyUnsubscribeToken(c.req.valid('query').token, deps.secret);
      if (!userId) return apiError(c, 'validation_failed', 'This unsubscribe link is not valid.');
      await deps.preferences.unsubscribe(userId);
      return c.json({ ok: true as const });
    })
    .get('/unsubscribe', async (c) => {
      const userId = verifyUnsubscribeToken(c.req.query('token') ?? '', deps.secret);
      if (!userId || !(await deps.preferences.unsubscribe(userId))) {
        return c.html(
          page(
            'Link not valid',
            'This unsubscribe link is not valid. Manage notifications in JobPilot settings.',
          ),
          400,
        );
      }
      return c.html(
        page(
          "You're unsubscribed",
          'You will no longer get emails from JobPilot. You can turn them back on in Settings.',
        ),
      );
    });
