import { apiErrorSchema } from '@job-pilot/shared/errors';
import { type Upload, uploadSchema } from '@job-pilot/shared/upload';
import { ApiError } from './api-client.ts';

/**
 * `POST /v1/uploads/cv` with upload progress (fetch cannot report it, XHR can).
 * Same contract as `callApi('uploadCv')`: multipart field `file`, `?replace=true` to replace an existing CV.
 */
export const uploadCvWithProgress = (
  file: File,
  options: { replace: boolean; onProgress: (percent: number) => void; signal?: AbortSignal },
): Promise<Upload> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/v1/uploads/cv${options.replace ? '?replace=true' : ''}`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) options.onProgress((event.loaded / event.total) * 100);
    });
    xhr.addEventListener('error', () => reject(new ApiError({ status: 0, code: 'network', message: 'You are offline' })));
    xhr.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = uploadSchema.safeParse(xhr.response);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError({ status: xhr.status, code: 'internal', message: 'Unexpected response' }));
        return;
      }
      const body = apiErrorSchema.safeParse(xhr.response);
      reject(
        new ApiError({
          status: xhr.status,
          code: body.success ? body.data.error.code : xhr.status >= 500 ? 'internal' : 'validation_failed',
          message: body.success ? body.data.error.message : xhr.statusText,
          requestId: xhr.getResponseHeader('x-request-id'),
        }),
      );
    });

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.set('file', file);
    xhr.send(form);
  });
