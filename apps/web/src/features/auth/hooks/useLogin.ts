import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '../../../lib/api';
import { login } from '../api/auth.api';
import type { LoginInput, Me } from '../types';

/**
 * Logging in, as a TanStack Query mutation: `mutate(input)` sends it, `isPending` is true while
 * it runs, and `error` is the ApiError (with its stable `code`) when it fails.
 */
export function useLogin() {
  return useMutation<Me, ApiError, LoginInput>({ mutationFn: login });
}
