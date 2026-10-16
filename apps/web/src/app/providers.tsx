import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { markSignedOut } from '@/features/auth';
import { onSessionExpired } from '@/lib/http';
import { createQueryClient, type QueryClient } from '@/lib/query';

/**
 * App-wide providers. One QueryClient per app instance, created once (useState), so a
 * re-render never throws the cache away and each test render starts empty. Tests may pass
 * their own client.
 *
 * When the network layer reports that the session expired (the refresh token was refused),
 * the session becomes null. Nothing navigates here: the protected layout sees null and sends
 * the user to /login with returnTo, and the public layout simply shows the login form.
 */
export function AppProviders({
  children,
  queryClient: provided,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [queryClient] = useState(() => provided ?? createQueryClient());

  useEffect(() => onSessionExpired(() => markSignedOut(queryClient)), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
