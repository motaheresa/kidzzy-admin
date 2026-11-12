import { KeyRoundIcon } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { Button } from '@/components/ui';
import { EnableNotifications, NotificationBell, PushProvider } from '@/features/notifications';
import { CHANGE_PASSWORD_PATH } from '@/lib/routing';
import { AppNav } from './AppNav';
import { SessionGate } from './SessionGate';

/**
 * Wraps every screen that needs a signed-in user, in the app shell: SessionGate decides who gets
 * in (loader, change-password, login, retry), and the shell is the header with the logo, the
 * academy and the navigation around the screen. During a temporary password (mustChangePassword,
 * US-02) only the change-password screen shows, with no navigation.
 */
export function ProtectedLayout() {
  return (
    <SessionGate>
      {(me) => {
        const mustChange = me.mustChangePassword;
        return (
          <PushProvider>
            <div className="flex min-h-dvh flex-col">
              <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
                <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
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
                      {me.academy.name}
                    </span>
                  </div>
                  {!mustChange && (
                    <div className="ms-auto flex shrink-0 items-center gap-1">
                      <EnableNotifications />
                      <NotificationBell />
                      <Button asChild variant="ghost" size="icon" className="sm:w-auto sm:px-4">
                        <Link to={CHANGE_PASSWORD_PATH} title="تغيير كلمة السر">
                          <KeyRoundIcon aria-hidden="true" />
                          <span className="sr-only sm:not-sr-only">تغيير كلمة السر</span>
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
                {!mustChange && <AppNav />}
              </header>
              <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
                <Outlet />
              </div>
            </div>
          </PushProvider>
        );
      }}
    </SessionGate>
  );
}
