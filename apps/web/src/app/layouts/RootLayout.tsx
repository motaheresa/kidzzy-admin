import { Outlet } from 'react-router';
import { Toaster } from '@/components/ui';

/** The root route: every screen, plus the global toaster the error layer reports into. */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}
