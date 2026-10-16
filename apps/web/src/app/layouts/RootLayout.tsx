import { Outlet } from 'react-router';
import { Toaster } from 'sonner';

/** The root route: every screen, plus the global toaster the error layer reports into. */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster dir="rtl" position="top-center" richColors closeButton />
    </>
  );
}
