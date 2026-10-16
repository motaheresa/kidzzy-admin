import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { useSession } from '@/features/auth';
import { loginPathFor } from '@/lib/routing';

/**
 * Wraps every screen that needs a signed-in user. It asks GET /auth/me (useSession):
 * - while it loads: a full-screen loader, so the login form never flashes for a signed-in user;
 * - signed in: the app shell (header with the logo and the academy) around the screen;
 * - signed out (null): the login page, with returnTo = the current path and query;
 * - the check failed (network, server): an error with "try again", because an outage is not a
 *   reason to sign the user out.
 */
export function ProtectedLayout() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;

  if (session.data) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
            <img src="/pwa-64x64.png" alt="" width={40} height={40} className="size-10" />
            <div className="grid leading-tight">
              <span className="font-display text-lg font-bold text-primary">كيدزي كودرز</span>
              <span className="text-xs text-muted-foreground">{session.data.academy.name}</span>
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          <Outlet />
        </div>
      </div>
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
