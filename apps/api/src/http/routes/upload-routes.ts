import type { Logger } from '@job-pilot/logger/logger';
import { AppError } from '@job-pilot/shared/errors';
import { limits, messages } from '@job-pilot/shared/limits';
import { routeParams, routes } from '@job-pilot/shared/routes';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { JobQueue } from '../../application/ports/job-queue.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { UploadRepository } from '../../application/ports/upload-repository.ts';
import { getOriginalDownload, getUpload } from '../../application/uploads/get-upload.ts';
import { uploadCv } from '../../application/uploads/upload-cv.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';
import { validate } from '../validate.ts';

export type UploadRoutesDeps = {
  uploads: UploadRepository;
  storage: FileStorage;
  jobs: JobQueue;
  log: Logger;
  rateLimitStore: RateLimitStore;
};

/** Multipart overhead allowance on top of the 5 MB file limit; the exact file size is checked in the use case. */
const multipartOverhead = 64 * 1024;

export const createUploadRoutes = (deps: UploadRoutesDeps) =>
  new Hono<AppEnv>()
    .post(
      '/cv',
      createRateLimit(deps.rateLimitStore, rateLimits.upload),
      bodyLimit({
        maxSize: limits.cvUpload.maxBytes + multipartOverhead,
        onError: () => {
          throw new AppError('payload_too_large', messages.cvTooLarge);
        },
      }),
      validate('query', routes.uploadCv.query),
      async (c) => {
        const { replace } = c.req.valid('query');
        const form = await c.req.parseBody();
        const file = form.file;
        if (!(file instanceof File)) {
          throw new AppError('validation_failed', messages.cvRequired, {
            file: messages.cvRequired,
          });
        }
        const result = await uploadCv(
          { ...deps, log: c.var.log },
          {
            userId: c.var.user.id,
            filename: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
            replace,
          },
        );
        return c.json(result, 201);
      },
    )
    .get('/:id', validate('param', routeParams.id), async (c) =>
      c.json(await getUpload(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .get('/:id/download', validate('param', routeParams.id), async (c) =>
      c.json(await getOriginalDownload(deps, c.var.user.id, c.req.valid('param').id)),
    );
