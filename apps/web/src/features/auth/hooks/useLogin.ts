import { useNavigate, useSearchParams } from 'react-router';
import { useApiMutation, useQueryClient } from '../../../lib/query';
import { safeReturnTo } from '../../../lib/routing';
import { login } from '../api/auth.api';
import { authKeys } from '../api/auth.keys';
import type { LoginInput, Me } from '../types';

/**
 * Logging in. On success the returned user becomes the session (no extra GET /auth/me), then
 * the user goes to the page they asked for (`returnTo`, checked by safeReturnTo) or home.
 * Errors are shown by the login form itself (errorHandling 'local').
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useApiMutation<Me, LoginInput>({
    mutationFn: login,
    meta: { errorHandling: 'local' },
    onSuccess: async (me) => {
      queryClient.setQueryData(authKeys.me(), me);
      await navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true });
    },
  });
}
