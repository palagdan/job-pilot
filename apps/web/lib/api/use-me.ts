'use client';

import type { Me } from '@job-pilot/shared/user';
import { useQuery } from '@tanstack/react-query';
import { callApi } from './api-client.ts';
import { queryKeys } from './query-client.ts';

/** Signed-in user. `initialMe` comes from the server layout, so the first render has data. */
export const useMe = (initialMe?: Me) =>
  useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => callApi('getMe', { signal }), initialData: initialMe });
