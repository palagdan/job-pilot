'use client';

import { type Theme, themes } from '@job-pilot/shared/enums';
import type { Me } from '@job-pilot/shared/user';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Select } from '../../../components/ui/select.tsx';
import { toast } from '../../../components/ui/toast.tsx';
import { callApi } from '../../../lib/api/api-client.ts';
import { queryKeys } from '../../../lib/api/query-client.ts';
import { useTheme } from '../../../lib/theme/theme-provider.tsx';

const labels: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Spec "Theme": System (default) / Light / Dark — applies at once without reload, stored per user. */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (next: Theme) => callApi('updateSettings', { body: { theme: next } }),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
    onError: () => toast.error('Could not save. Check your connection.'),
  });

  const change = (next: Theme) => {
    // Update the cached user first, so the shell's theme sync does not switch back while the request runs.
    queryClient.setQueryData<Me>(queryKeys.me, (me) => (me ? { ...me, theme: next } : me));
    setTheme(next);
    save.mutate(next);
  };

  return (
    <Select
      label="Theme"
      options={themes.map((t) => ({ value: t, label: labels[t] }))}
      value={theme}
      onValueChange={(v) => change(v as Theme)}
    />
  );
}
