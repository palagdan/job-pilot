'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from '../../components/ui/toast.tsx';
import { callApi } from '../api/api-client.ts';
import { queryKeys } from '../api/query-client.ts';

/**
 * Sign out (user menu, Settings). Spec C10: confirm only when packs are ready to send
 * ("2 packs are ready to send. The agent keeps preparing new ones while you are signed out.").
 */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [readyToSend, setReadyToSend] = useState<number | null>(null);

  const signOut = async () => {
    // Better Auth requires a JSON content type on POST endpoints.
    const res = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!res.ok) {
      toast.error('Could not sign out. Try again.');
      return;
    }
    queryClient.clear();
    router.replace('/login');
  };

  /** Asks C10 when something is waiting; otherwise signs out at once. */
  const request = async () => {
    const stats = await callApi('getPipelineStats').catch(() => null);
    queryClient.setQueryData(queryKeys.pipelineStats, stats ?? undefined);
    if (stats && stats.readyToSend > 0) setReadyToSend(stats.readyToSend);
    else await signOut();
  };

  return {
    request,
    signOut,
    /** Props for the C10 ConfirmDialog. */
    confirm: {
      open: readyToSend !== null,
      onOpenChange: (open: boolean) => !open && setReadyToSend(null),
      title: 'Sign out?',
      description: `${readyToSend === 1 ? '1 pack is' : `${readyToSend} packs are`} ready to send. The agent keeps preparing new ones while you are signed out.`,
      confirmLabel: 'Sign out',
      onConfirm: signOut,
    },
  };
}
