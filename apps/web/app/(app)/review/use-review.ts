'use client';

import { useQuery } from '@tanstack/react-query';
import { callApi } from '../../../lib/api/api-client.ts';

const POLL_MS = 3_000;

export const reviewKeys = {
  all: ['review'] as const,
  list: ['review', 'list'] as const,
  item: (id: string) => ['review', 'item', id] as const,
};

/** Items waiting for review, for prev/next. */
export const useReviewList = () =>
  useQuery({
    queryKey: reviewKeys.list,
    queryFn: ({ signal }) => callApi('listReview', { signal }),
  });

/** One item with drafts and the special CV; polls while the pack is still being written. */
export const useReview = (id: string) =>
  useQuery({
    queryKey: reviewKeys.item(id),
    queryFn: ({ signal }) => callApi('getReview', { params: { id }, signal }),
    // Do not replace text the user is editing when the window regains focus.
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.item.status === 'preparing' ? POLL_MS : false),
  });
