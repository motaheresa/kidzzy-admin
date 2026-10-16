import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * App-wide providers. TanStack Query keeps server data (queries) and runs changes (mutations)
 * for the hooks in src/features. One QueryClient per app instance, created once (useState), so
 * a re-render never throws the cache away and each test render starts with an empty one.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
