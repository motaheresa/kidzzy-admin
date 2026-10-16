import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { useSession } from '@/features/auth';
import { loginPathFor } from '@/lib/routing';

/**
 * Wraps every screen that needs a signed-in user. It asks GET /auth/me (useSession):
 * - while it loads: a full-screen loader, so the login form never flashes for a signed-in user;
 * - signed in: the screen (<Outlet />);
 * - signed out (null): the login page, with returnTo = the current path and query;
 * - the check failed (network, server): an error with "try again", because an outage is not a
 *   reason to sign the user out.
 */
export function ProtectedLayout() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;
  if (session.data) return <Outlet />;
  if (session.data === null) return <Navigate to={loginPathFor(location)} replace />;

  return (
    <FullScreenMessage title={session.error?.message ?? 'حصلت مشكلة، جرب تاني'}>
      <Button onClick={() => void session.refetch()}>جرب تاني</Button>
    </FullScreenMessage>
  );
}
