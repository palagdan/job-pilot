import { updateDraftInputSchema } from '@job-pilot/shared/draft';
import { routeParams } from '@job-pilot/shared/routes';
import { contentDisposition } from '@job-pilot/storage/file-storage';
import { Hono } from 'hono';
import {
  completeFollowUp,
  eventIcs,
  getDrafts,
  getReview,
  listReview,
  markNotSent,
  markRegistered,
  markSent,
  type ReviewDeps,
  updateDraft,
} from '../../application/review/review-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

/** GET /v1/review — items waiting for review (prev/next). */
export const createReviewListRoutes = (deps: ReviewDeps) =>
  new Hono<AppEnv>().get('/', async (c) => c.json(await listReview(deps, c.var.user.id)));

/** 08 Review item routes, mounted under /v1/pipeline after the Pipeline routes (which serve `GET /:id` and `/stats`). */
export const createReviewItemRoutes = (deps: ReviewDeps) =>
  new Hono<AppEnv>()
    .get('/:id/review', validate('param', routeParams.id), async (c) =>
      c.json(await getReview(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .get('/:id/drafts', validate('param', routeParams.id), async (c) =>
      c.json(await getDrafts(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .post('/:id/sent', validate('param', routeParams.id), async (c) =>
      c.json(await markSent(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .post('/:id/registered', validate('param', routeParams.id), async (c) =>
      c.json(await markRegistered(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .post('/:id/not-sent', validate('param', routeParams.id), async (c) =>
      c.json(await markNotSent(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .get('/:id/event.ics', validate('param', routeParams.id), async (c) => {
      const { filename, content } = await eventIcs(deps, c.var.user.id, c.req.valid('param').id);
      return c.body(content, 200, {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': contentDisposition(filename, 'attachment'),
        'cache-control': 'private, no-store',
      });
    });

/** PUT /v1/drafts/:id */
export const createDraftRoutes = (deps: ReviewDeps) =>
  new Hono<AppEnv>().put(
    '/:id',
    validate('param', routeParams.id),
    validate('json', updateDraftInputSchema),
    async (c) =>
      c.json(await updateDraft(deps, c.var.user.id, c.req.valid('param').id, c.req.valid('json'))),
  );

/** POST /v1/follow-ups/:id/done */
export const createFollowUpRoutes = (deps: ReviewDeps) =>
  new Hono<AppEnv>().post('/:id/done', validate('param', routeParams.id), async (c) =>
    c.json(await completeFollowUp(deps, c.var.user.id, c.req.valid('param').id)),
  );
