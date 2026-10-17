import { createBrowserRouter, type RouteObject } from 'react-router';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { EditGroupPage } from '@/pages/groups/EditGroupPage';
import { EnrollStudentPage } from '@/pages/groups/EnrollStudentPage';
import { GroupPage } from '@/pages/groups/GroupPage';
import { GroupsPage } from '@/pages/groups/GroupsPage';
import { NewGroupPage } from '@/pages/groups/NewGroupPage';
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
import { TransferStudentPage } from '@/pages/students/TransferStudentPage';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { RootLayout } from './layouts/RootLayout';
import { RequirePermission } from './RequirePermission';

/**
 * Every route of the app (ADR-0012). Layout routes have no path: they wrap their children.
 *   RootLayout (toaster, error boundary)
 *     PublicLayout     /login        signed-in users are sent home
 *     ProtectedLayout  /             signed-out users are sent to /login?returnTo=…
 *       /change-password   any signed-in user; the only screen during a temporary password
 *       RequirePermission groups.read          /groups, /groups/:id
 *       RequirePermission groups.create        /groups/new
 *       RequirePermission groups.update        /groups/:id/edit
 *       RequirePermission enrollments.manage   /groups/:id/enroll, /students/:id/transfer
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
          // Every signed-in user may change their password: no RequirePermission (US-02).
          { path: '/change-password', element: <ChangePasswordPage /> },
          {
            element: <RequirePermission permission="groups.read" />,
            children: [
              { path: '/groups', element: <GroupsPage /> },
              { path: '/groups/:id', element: <GroupPage /> },
            ],
          },
          {
            element: <RequirePermission permission="groups.create" />,
            children: [{ path: '/groups/new', element: <NewGroupPage /> }],
          },
          {
            element: <RequirePermission permission="groups.update" />,
            children: [{ path: '/groups/:id/edit', element: <EditGroupPage /> }],
          },
          {
            element: <RequirePermission permission="enrollments.manage" />,
            children: [
              { path: '/groups/:id/enroll', element: <EnrollStudentPage /> },
              { path: '/students/:id/transfer', element: <TransferStudentPage /> },
            ],
          },
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
