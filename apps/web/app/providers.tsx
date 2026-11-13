'use client';

import type { Theme } from '@job-pilot/shared/enums';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Toaster } from '../components/ui/toast.tsx';
import { TooltipProvider } from '../components/ui/tooltip.tsx';
import { createQueryClient } from '../lib/api/query-client.ts';
import { ThemeProvider } from '../lib/theme/theme-provider.tsx';

export function Providers({ theme, children }: { theme: Theme; children: ReactNode }) {
  // One client per browser session (useState keeps it stable across re-renders).
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider initialTheme={theme}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
