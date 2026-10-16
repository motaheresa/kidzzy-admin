import { ErrorCode } from '@kidzzy/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { authKeys, markSignedOut } from '@/features/auth';
import { isAppError } from '@/lib/errors';
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
 *
 * When any query or mutation answers 403 PASSWORD_CHANGE_REQUIRED (an admin reset the password
 * while this screen was open), the session is read again: it then says mustChangePassword, and
 * the protected layout sends the user to the change-password screen (US-02).
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

  useEffect(() => {
    const onError = (error: unknown) => {
      if (isAppError(error) && error.code === ErrorCode.PasswordChangeRequired) {
        void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
