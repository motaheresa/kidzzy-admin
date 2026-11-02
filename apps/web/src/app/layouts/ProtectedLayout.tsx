import { KeyRoundIcon } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { useSession } from '@/features/auth';
import { EnableNotifications, NotificationBell, PushProvider } from '@/features/notifications';
import { CHANGE_PASSWORD_PATH, changePasswordPathFor, loginPathFor } from '@/lib/routing';
import { AppNav } from './AppNav';

/**
 * Wraps every screen that needs a signed-in user. It asks GET /auth/me (useSession):
 * - while it loads: a full-screen loader, so the login form never flashes for a signed-in user;
 * - signed in: the app shell (header with the logo, the academy and the navigation) around the
 *   screen;
 * - signed in with a temporary password (mustChangePassword, US-02): only the change-password
 *   screen, with returnTo = the page they asked for, and no navigation. The API refuses every
 *   other route anyway (403 PASSWORD_CHANGE_REQUIRED);
 * - signed out (null): the login page, with returnTo = the current path and query;
 * - the check failed (network, server): an error with "try again", because an outage is not a
 *   reason to sign the user out.
 */
export function ProtectedLayout() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;

  if (session.data) {
    const mustChange = session.data.mustChangePassword;
    if (mustChange && location.pathname !== CHANGE_PASSWORD_PATH) {
      return <Navigate to={changePasswordPathFor(location)} replace />;
    }

    return (
      <PushProvider>
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
            <div className="mx-auto grid h-16 w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/pwa-64x64.png"
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0"
                />
                <div className="grid min-w-0 leading-tight">
                  <span className="truncate font-display text-lg font-bold text-primary">
                    كيدزي كودرز
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {session.data.academy.name}
                  </span>
                </div>
              </div>
              <div className="flex justify-center">{!mustChange && <NotificationBell />}</div>
              <div className="flex items-center justify-end gap-1">
                {!mustChange && (
                  <>
                    <EnableNotifications />
                    <Button asChild variant="ghost" size="icon" className="sm:w-auto sm:px-4">
                      <Link to={CHANGE_PASSWORD_PATH} title="تغيير كلمة السر">
                        <KeyRoundIcon aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">تغيير كلمة السر</span>
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
            {!mustChange && <AppNav />}
          </header>
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
            <Outlet />
          </div>
        </div>
      </PushProvider>
    );
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
