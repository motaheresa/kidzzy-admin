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
 *     DesignSystemPage /dev/design-system   development only
 * A new signed-in screen is a child of ProtectedLayout.
 */

/**
 * Development-only routes. import.meta.env.DEV is the constant false in a production build, so
 * this array is empty there and the dynamic import, with the whole page, is dropped from the
 * bundle (scripts/check-build.mjs fails if it is not).
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/design-system',
        lazy: async () => ({
          Component: (await import('@/pages/dev/DesignSystemPage')).DesignSystemPage,
        }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { element: <PublicLayout />, children: [{ path: '/login', element: <LoginPage /> }] },
      { element: <ProtectedLayout />, children: [{ path: '/', element: <HomePage /> }] },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** The browser router (real URL and history). Tests use createMemoryRouter(routes) instead. */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
