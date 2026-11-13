import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client.ts';

/** 4xx are final (except 408/429); 5xx and network errors are retried twice. */
const shouldRetry = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
    return false;
  }
  return failureCount < 2;
};

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });

/** Query keys in one place so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  targets: ['targets'] as const,
  schedule: ['schedule'] as const,
  today: (type?: string) => ['today', type ?? 'all'] as const,
  pipeline: (query: unknown) => ['pipeline', query] as const,
  cvs: ['cvs'] as const,
  agentStatus: ['agent-status'] as const,
};
