import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { EditInstructorPage } from '@/pages/instructors/EditInstructorPage';
import { InstructorPage } from '@/pages/instructors/InstructorPage';
import { InstructorsPage } from '@/pages/instructors/InstructorsPage';
import { NewInstructorPage } from '@/pages/instructors/NewInstructorPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { EditStudentPage } from '@/pages/students/EditStudentPage';
import { NewStudentPage } from '@/pages/students/NewStudentPage';
import { StudentPage } from '@/pages/students/StudentPage';
import { StudentsPage } from '@/pages/students/StudentsPage';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { RootLayout } from './layouts/RootLayout';
import { RequirePermission } from './RequirePermission';

/**
 * Every route of the app (ADR-0012). Layout routes have no path: they wrap their children.
 *   RootLayout (toaster, error boundary)
 *     PublicLayout     /login        signed-in users are sent home
 *     ProtectedLayout  /             signed-out users are sent to /login?returnTo=…
 *       RequirePermission students.read        /students, /students/:id
 *       RequirePermission students.manage      /students/new, /students/:id/edit
 *       RequirePermission instructors.read     /instructors, /instructors/:id
 *       RequirePermission instructors.manage   /instructors/new, /instructors/:id/edit
 *     NotFoundPage     *
 *     DesignSystemPage /dev/design-system   development only
 * A new signed-in screen is a child of ProtectedLayout, inside a RequirePermission for the
 * permission its main endpoint requires, and gets its link in layouts/AppNav.tsx.
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
      {
        element: <ProtectedLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            element: <RequirePermission permission="students.read" />,
            children: [
              { path: '/students', element: <StudentsPage /> },
              { path: '/students/:id', element: <StudentPage /> },
            ],
          },
          {
            element: <RequirePermission permission="students.manage" />,
            children: [
              { path: '/students/new', element: <NewStudentPage /> },
              { path: '/students/:id/edit', element: <EditStudentPage /> },
            ],
          },
          {
            element: <RequirePermission permission="instructors.read" />,
            children: [
              { path: '/instructors', element: <InstructorsPage /> },
              { path: '/instructors/:id', element: <InstructorPage /> },
            ],
          },
          {
            element: <RequirePermission permission="instructors.manage" />,
            children: [
              { path: '/instructors/new', element: <NewInstructorPage /> },
              { path: '/instructors/:id/edit', element: <EditInstructorPage /> },
            ],
          },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** The browser router (real URL and history). Tests use createMemoryRouter(routes) instead. */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
