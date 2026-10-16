import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../../../lib/api';
import { logout } from '../api/auth.api';

/**
 * Logging out, as a mutation. Whatever the outcome, every cached query belonged to the signed-in
 * user, so the cache is cleared once it settles.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: logout,
    onSettled: () => queryClient.clear(),
  });
}
