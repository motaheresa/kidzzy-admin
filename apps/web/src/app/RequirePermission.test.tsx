import { render, screen } from '@testing-library/react';
import type { PermissionAction } from '@kidzzy/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { authKeys, usePermissions, type Me } from '@/features/auth';
import { createQueryClient } from '@/lib/query';
import { AppProviders } from './providers';
import { RequirePermission } from './RequirePermission';

const meWith = (permissions: string[]): Me => ({
  id: 'u1',
  name: 'Mona',
  email: 'mona@test.local',
  phone: null,
  roles: ['Instructor'],
  permissions,
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
});

/** Shows what usePermissions answers, so the hook is tested through a real session. */
function Probe({ action }: { action: PermissionAction }) {
  const { can, scopeFor } = usePermissions();
  return <p>{`${String(can(action))}:${String(scopeFor(action))}`}</p>;
}

function renderWithSession(me: Me | null, permission: PermissionAction = 'groups.read') {
  const queryClient = createQueryClient();
  queryClient.setQueryData(authKeys.me(), me); // the session, as ProtectedLayout has it
  const router = createMemoryRouter(
    [
      {
        element: <RequirePermission permission={permission} />,
        children: [{ path: '/', element: <h1>الجروبات</h1> }],
      },
      { path: '/probe/:action', element: <Probe action="groups.read" /> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe('RequirePermission', () => {
  it.each([['groups.read:any'], ['groups.read:own']])('shows the screen with %s', (key) => {
    renderWithSession(meWith([key]));
    expect(screen.getByRole('heading', { name: 'الجروبات' })).toBeInTheDocument();
  });

  it('shows the Arabic forbidden page without the permission', () => {
    renderWithSession(meWith(['students.read:own']));
    expect(screen.queryByRole('heading', { name: 'الجروبات' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ارجع للرئيسية' })).toHaveAttribute('href', '/');
  });
});

describe('usePermissions', () => {
  it.each([
    [['groups.read:any', 'groups.read:own'], 'true:any'],
    [['groups.read:own'], 'true:own'],
    [['payments.read:own'], 'false:null'],
  ])('with %j answers %s', async (permissions, expected) => {
    const router = renderWithSession(meWith(permissions));
    await router.navigate('/probe/groups.read');
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('answers false and null when signed out', async () => {
    const router = renderWithSession(null);
    await router.navigate('/probe/groups.read');
    expect(await screen.findByText('false:null')).toBeInTheDocument();
  });
});
