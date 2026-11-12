import type { ReactNode } from 'react';
import type { Me } from '@kidzzy/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { useSession } from '@/features/auth';
import { CHANGE_PASSWORD_PATH, changePasswordPathFor, loginPathFor } from '@/lib/routing';

/**
 * The check every signed-in screen needs, whatever frame it is shown in (the app shell or the
 * reports workspace). It asks GET /auth/me (useSession):
 * - while it loads: a full-screen loader, so the login form never flashes for a signed-in user;
 * - signed in with a temporary password (mustChangePassword, US-02): only the change-password
 *   screen, with returnTo = the page they asked for. The API refuses every other route anyway
 *   (403 PASSWORD_CHANGE_REQUIRED);
 * - signed in: `children(me)`, the frame around the screen;
 * - signed out (null): the login page, with returnTo = the current path and query;
 * - the check failed (network, server): an error with "try again", because an outage is not a
 *   reason to sign the user out.
 */
export function SessionGate({ children }: { children: (me: Me) => ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;

  if (session.data) {
    if (session.data.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
      return <Navigate to={changePasswordPathFor(location)} replace />;
    }
    return <>{children(session.data)}</>;
  }

  if (session.data === null) return <Navigate to={loginPathFor(location)} replace />;

  return (
    <FullScreenMessage
      title={session.error?.message ?? 'حصلت مشكلة، جرب تاني'}
      description="بياناتك محفوظة، جرب تاني بعد شوية."
    >
      <Button onClick={() => void session.refetch()}>جرب تاني</Button>
    </FullScreenMessage>
  );
}

/**
 * SessionGate as a layout route with no frame of its own: put it above a RequirePermission and a
 * frame that is not the app shell (the reports workspace), so the permission is only checked once
 * the session is known, and a signed-out user is sent to the login page and not to "forbidden".
 */
export function SessionGateLayout() {
  return <SessionGate>{() => <Outlet />}</SessionGate>;
}
