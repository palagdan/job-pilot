'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from '../../components/ui/toast.tsx';
import { callApi } from './api-client.ts';
import { queryKeys } from './query-client.ts';
import { notifyError } from '../errors/notify-error.ts';

const fail = (e: unknown) => notifyError(e, 'Could not save. Check your connection.');

export const useAgentStatus = () =>
  useQuery({ queryKey: queryKeys.agentStatus, queryFn: ({ signal }) => callApi('getAgentStatus', { signal }) });

/**
 * Pause (C07 "Pause your agent?") and resume. Both refresh `me` (pausedAt → banner) and the agent status.
 * `confirm` is the C07 ConfirmDialog props; `requestPause` opens it.
 */
export function useAgentControls() {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agentStatus }),
      queryClient.invalidateQueries({ queryKey: queryKeys.schedule }),
    ]);
  };

  const pause = useMutation({
    mutationFn: () => callApi('pauseAgent'),
    onSuccess: async (status) => {
      queryClient.setQueryData(queryKeys.agentStatus, status);
      await refresh();
      toast('Agent paused');
    },
    onError: fail,
  });
  const resume = useMutation({
    mutationFn: () => callApi('resumeAgent'),
    onSuccess: async (status) => {
      queryClient.setQueryData(queryKeys.agentStatus, status);
      await refresh();
      toast('Agent resumed');
    },
    onError: fail,
  });

  return {
    requestPause: () => setAsking(true),
    resume: () => resume.mutate(),
    resuming: resume.isPending,
    confirm: {
      open: asking,
      onOpenChange: setAsking,
      title: 'Pause your agent?',
      description: 'No runs and no emails until you resume. Your packs and pipeline stay as they are.',
      confirmLabel: 'Pause',
      onConfirm: () => pause.mutateAsync(),
    },
  };
}
