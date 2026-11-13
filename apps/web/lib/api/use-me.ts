'use client';

import { useQuery } from '@tanstack/react-query';
import { callApi } from './api-client.ts';
import { queryKeys } from './query-client.ts';

/** Signed-in user. Error `unauthorized` = no session. */
export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => callApi('getMe', { signal }) });
