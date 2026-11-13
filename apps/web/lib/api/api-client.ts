import { type ApiError as ApiErrorBody, apiErrorSchema, type ErrorCode } from '@job-pilot/shared/errors';
import { type RouteName, routes } from '@job-pilot/shared/routes';
import type { z } from 'zod';

/**
 * Typed client built from the shared route map (contract-first): `callApi('getMe')`,
 * `callApi('putTargets', { body })`, `callApi('getCv', { params: { id } })`.
 * Requests go to the same origin; Next rewrites `/v1/*` to the api, so the session cookie is sent automatically.
 * Responses are parsed with the route's zod schema, so contract drift fails loudly.
 */

type Route<N extends RouteName> = (typeof routes)[N];
type SchemaOf<T> = T extends z.ZodType ? T : never;

type BodyOf<N extends RouteName> = Route<N> extends { body: infer B } ? (B extends z.ZodType ? z.input<B> : FormData) : never;
type QueryOf<N extends RouteName> = Route<N> extends { query: infer Q } ? z.input<SchemaOf<Q>> : never;
type ParamsOf<N extends RouteName> = Route<N>['path'] extends `${string}:id${string}` ? { id: string } : never;

export type ResponseOf<N extends RouteName> = Route<N>['response'] extends z.ZodType
  ? z.output<Route<N>['response']>
  : Response;

type Options<N extends RouteName> = {
  signal?: AbortSignal;
} & ([ParamsOf<N>] extends [never] ? { params?: never } : { params: ParamsOf<N> }) &
  ([BodyOf<N>] extends [never] ? { body?: never } : { body: BodyOf<N> }) &
  ([QueryOf<N>] extends [never] ? { query?: never } : { query?: QueryOf<N> });

/** Error from the api (shared error shape) or the network. `code: 'network'` = offline / unreachable (E09). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'network';
  readonly requestId: string | null;
  readonly fields: Record<string, string> | undefined;

  constructor(input: { status: number; code: ErrorCode | 'network'; message: string; requestId?: string | null; fields?: Record<string, string> }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.fields = input.fields;
  }
}

const buildUrl = (path: string, params?: { id: string }, query?: Record<string, unknown>) => {
  const filled = params ? path.replace(':id', encodeURIComponent(params.id)) : path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${filled}?${qs}` : filled;
};

const toApiError = async (res: Response): Promise<ApiError> => {
  let body: ApiErrorBody | null = null;
  try {
    body = apiErrorSchema.parse(await res.json());
  } catch {
    // Not our error shape (proxy error page, etc.)
  }
  return new ApiError({
    status: res.status,
    code: body?.error.code ?? (res.status >= 500 ? 'internal' : 'validation_failed'),
    message: body?.error.message ?? res.statusText,
    requestId: body?.error.requestId ?? res.headers.get('x-request-id'),
    fields: body?.error.fields,
  });
};

export async function callApi<N extends RouteName>(name: N, ...[options]: {} extends Options<N> ? [Options<N>?] : [Options<N>]): Promise<ResponseOf<N>> {
  const route = routes[name];
  const opts = (options ?? {}) as { params?: { id: string }; body?: unknown; query?: Record<string, unknown>; signal?: AbortSignal };
  const isForm = opts.body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(buildUrl(route.path, opts.params, opts.query), {
      method: route.method,
      credentials: 'same-origin',
      signal: opts.signal,
      headers: opts.body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: 'network', message: 'You are offline' });
  }

  if (!res.ok) throw await toApiError(res);

  const schema = route.response;
  if (typeof schema === 'string') return res as ResponseOf<N>; // 'sse' | 'file' | 'redirect': caller reads the Response
  return (schema as z.ZodType).parse(await res.json()) as ResponseOf<N>;
}
