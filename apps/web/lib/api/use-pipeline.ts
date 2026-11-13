'use client';

import type { PipelineSort, PipelineStatusGroup, Route } from '@job-pilot/shared/enums';
import type { manualStatuses, PipelineItem } from '@job-pilot/shared/pipeline';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../components/ui/toast.tsx';
import { notifyError } from '../errors/notify-error.ts';
import { callApi } from './api-client.ts';
import { queryKeys } from './query-client.ts';

export type PipelineFilters = {
  statusGroup?: PipelineStatusGroup;
  type?: 'job' | 'event';
  sort: PipelineSort;
};

const PAGE_SIZE = 50;

/** 10 Pipeline rows, 50 per page ("Show more"). */
export const usePipelineList = (filters: PipelineFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.pipeline(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      callApi('listPipeline', { query: { ...filters, limit: PAGE_SIZE, cursor: pageParam }, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const usePipelineStats = () =>
  useQuery({ queryKey: queryKeys.pipelineStats, queryFn: ({ signal }) => callApi('getPipelineStats', { signal }) });

export const usePipelineNotes = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.pipelineNotes(id),
    queryFn: ({ signal }) => callApi('listNotes', { params: { id }, signal }),
    enabled,
  });

const fail = (e: unknown) => notifyError(e, 'Could not save. Check your connection.');

export type ManualStatus = (typeof manualStatuses)[number];

const statusToast: Record<ManualStatus, string> = {
  replied: 'Marked as replied',
  interview: 'Interview saved',
  offer: 'Marked as offer',
  rejected: 'Marked as rejected',
};

/** Row actions (Pipeline row menu). Every success refreshes the list, stats and Today's "ready to send". */
export function usePipelineActions(item: PipelineItem) {
  const queryClient = useQueryClient();
  const params = { id: item.id };
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineAll }),
      queryClient.invalidateQueries({ queryKey: ['today'] }),
    ]);

  return {
    setStatus: useMutation({
      mutationFn: (input: { status: ManualStatus; interviewAt?: string | null }) =>
        callApi('updatePipelineStatus', {
          params,
          body: { status: input.status, interviewAt: input.interviewAt ?? null },
        }),
      onSuccess: async (_, input) => {
        await refresh();
        toast(statusToast[input.status]);
      },
      onError: fail,
    }),
    changeRoute: useMutation({
      mutationFn: (route: Route) => callApi('changePipelineRoute', { params, body: { route } }),
      onSuccess: async () => {
        await refresh();
        toast('Route changed. The agent is rewriting the pack.');
      },
      onError: fail,
    }),
    stop: useMutation({
      mutationFn: () => callApi('stopPursuing', { params }),
      onSuccess: async () => {
        await refresh();
        toast('Stopped pursuing');
      },
      onError: fail,
    }),
    /** "Mark follow-up as sent": the next one (if any) is scheduled by the api. */
    completeFollowUp: useMutation({
      mutationFn: (followUpId: string) => callApi('completeFollowUp', { params: { id: followUpId } }),
      onSuccess: async ({ undoToken, nextFollowUpAt }) => {
        await refresh();
        toast(nextFollowUpAt ? 'Follow-up marked as sent. Next one in 7 days.' : 'Follow-up marked as sent', {
          undo: () =>
            void callApi('undo', { body: { undoToken } })
              .then(refresh)
              .catch(fail),
        });
      },
      onError: fail,
    }),
    addNote: useMutation({
      mutationFn: (body: string) => callApi('addNote', { params, body: { body } }),
      onSuccess: async () => {
        await refresh();
        toast('Note added');
      },
      onError: fail,
    }),
  };
}
