import { useNavigate } from 'react-router';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { LOGIN_PATH } from '@/lib/routing';
import { logout } from '../api/auth.api';
import { markSignedOut } from '../session';

/**
 * Logging out. Whatever the API answers, this device is signed out afterwards: every cached
 * query belonged to the user, so the cache is cleared, the session is set to null (BEFORE
 * navigating, or the public layout would still see the old user and bounce back home), then the
 * login page opens.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useApiMutation<void, void>({
    mutationFn: logout,
    meta: { errorHandling: 'local' },
    onSettled: async () => {
      queryClient.clear();
      markSignedOut(queryClient);
      await navigate(LOGIN_PATH, { replace: true });
    },
  });
}
