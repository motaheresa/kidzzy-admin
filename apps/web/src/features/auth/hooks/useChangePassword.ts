import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useApiMutation, useQueryClient } from '@/lib/query';
import { safeReturnTo } from '@/lib/routing';
import { changePassword } from '../api/auth.api';
import { authKeys } from '../api/auth.keys';
import type { ChangePasswordRequest } from '../types';

/**
 * Changing the signed-in user's password (US-02). On success the session is read again (the
 * new cookies say mustChangePassword false), then the user goes to the page they asked for
 * (`returnTo`, checked by safeReturnTo) or home. The form shows the errors itself.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useApiMutation<void, ChangePasswordRequest>({
    mutationFn: changePassword,
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
      toast.success('اتغيرت كلمة السر');
      await navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true });
    },
  });
}
