import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { RootLayout } from './layouts/RootLayout';

/**
 * Every route of the app (ADR-0012). Layout routes have no path: they wrap their children.
 *   RootLayout (toaster, error boundary)
 *     PublicLayout     /login        signed-in users are sent home
 *     ProtectedLayout  /             signed-out users are sent to /login?returnTo=…
 *     NotFoundPage     *
 * A new signed-in screen is a child of ProtectedLayout.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { element: <PublicLayout />, children: [{ path: '/login', element: <LoginPage /> }] },
      { element: <ProtectedLayout />, children: [{ path: '/', element: <HomePage /> }] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** The browser router (real URL and history). Tests use createMemoryRouter(routes) instead. */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
