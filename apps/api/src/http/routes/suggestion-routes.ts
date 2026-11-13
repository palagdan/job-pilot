import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { CvFactsReader } from '../../application/ports/cv-facts-reader.ts';
import { getSuggestions } from '../../application/suggestions/get-suggestions.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

export const createSuggestionRoutes = (deps: { cvFacts: CvFactsReader }) =>
  new Hono<AppEnv>().get('/', validate('query', routes.getSuggestions.query), async (c) => {
    c.header('cache-control', 'private, max-age=60');
    return c.json(await getSuggestions(deps, c.var.user.id, c.req.valid('query')));
  });
