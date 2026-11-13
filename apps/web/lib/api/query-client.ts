import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { raiseGlobalError } from '../errors/global-errors.ts';
import { ApiError } from './api-client.ts';

/** 4xx are final (except 408/429); 5xx and network errors are retried twice. */
const shouldRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
    return false;
  }
  return failureCount < 2;
};

/**
 * Every query and mutation reports 401 / 429 / 5xx to the global error windows (E03 / E11 / E12).
 * A failed background refetch of data already on screen stays quiet (no E12 over a working page).
 */
export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data !== undefined && !(error instanceof ApiError && error.code === 'unauthorized')) return;
        raiseGlobalError(error, () => void query.fetch());
      },
    }),
    mutationCache: new MutationCache({
      // "Try again" closes the window; the user repeats the action (their input is still on screen).
      onError: (error) => void raiseGlobalError(error, () => {}),
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });

/** Query keys in one place so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  currentUpload: ['upload', 'current'] as const,
  targets: ['targets'] as const,
  schedule: ['schedule'] as const,
  today: (type?: string) => ['today', type ?? 'all'] as const,
  pipeline: (query: unknown) => ['pipeline', query] as const,
  cvs: ['cvs'] as const,
  agentStatus: ['agent-status'] as const,
  pipelineStats: ['pipeline', 'stats'] as const,
};
