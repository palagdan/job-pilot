'use client';

import type { AgentStatus } from '@job-pilot/shared/agent-run';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiError, callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';

const POLL_MS = 2_000;

export const useTodayFeed = () =>
  useQuery({
    queryKey: queryKeys.today(),
    queryFn: ({ signal }) => callApi('getToday', { signal }),
    // Skipped / pursued cards stay on screen for their undo window; a refetch would drop them early.
    refetchOnWindowFocus: false,
  });

export const useTodayTargets = () =>
  useQuery({
    queryKey: queryKeys.targets,
    queryFn: ({ signal }) => callApi('getTargets', { signal }),
    refetchOnWindowFocus: false,
  });

/** Agent status; polls every 2 s while a run is active and refreshes Today when it ends. */
export function useAgentStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.agentStatus,
    queryFn: ({ signal }) => callApi('getAgentStatus', { signal }),
    refetchInterval: (q) => (q.state.data?.currentRun ? POLL_MS : false),
  });

  const runId = query.data?.currentRun?.id ?? null;
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current && !runId) void queryClient.invalidateQueries({ queryKey: ['today'] });
    previous.current = runId;
  }, [runId, queryClient]);

  return query;
}

/** "Run now". A 409 `agent_busy` just means a run is already going: show it instead of failing. */
export function useRunNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callApi('startRun'),
    onSuccess: (run) => {
      queryClient.setQueryData<AgentStatus>(queryKeys.agentStatus, (old) =>
        old ? { ...old, currentRun: run } : { paused: false, currentRun: run, lastRun: null, nextRunAt: null },
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'agent_busy') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.agentStatus });
      }
    },
  });
}
