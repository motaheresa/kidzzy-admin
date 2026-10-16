import { Navigate, Outlet, useSearchParams } from 'react-router';
import { FullScreenMessage } from '@/components/ui';
import { useSession } from '@/features/auth';
import { safeReturnTo } from '@/lib/routing';

/**
 * Wraps the screens for signed-out users (/login). A user who is already signed in leaves for
 * the validated returnTo (home when there is none). It must be the same target useLogin
 * navigates to: setting the session after login re-renders this layout too, and two different
 * targets would race. If the session check itself fails (network), the login form is shown.
 */
export function PublicLayout() {
  const session = useSession();
  const [searchParams] = useSearchParams();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;
  if (session.data) return <Navigate to={safeReturnTo(searchParams.get('returnTo'))} replace />;
  return <Outlet />;
}
