import { render, screen, within } from '@testing-library/react';
import { HouseIcon, WalletIcon } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionNav, type SectionNavItem } from './SectionNav';

// The permissions of the signed-in user, by action, with their scope.
let held: Record<string, 'any' | 'own'> = {};
vi.mock('@/features/auth', () => ({
  usePermissions: () => ({
    can: (action: string) => action in held,
    scopeFor: (action: string) => held[action] ?? null,
  }),
}));

const ITEMS: SectionNavItem[] = [
  { to: '/', label: 'الرئيسية', icon: HouseIcon, end: true },
  { to: '/payments', label: 'المدفوعات', icon: WalletIcon, permission: 'payments.read' },
  {
    to: '/reports',
    label: 'التقارير',
    icon: WalletIcon,
    permission: 'reports.read',
    scope: 'any',
  },
  { to: '/reports/finance', label: 'الفلوس', icon: WalletIcon, search: '?from=2026-11-01' },
];

function renderNav(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionNav label="قايمة تجريبية" items={ITEMS} maxWidth="max-w-7xl" />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'قايمة تجريبية' });
}

beforeEach(() => {
  held = {};
});

describe('SectionNav', () => {
  it('shows an item without a permission to everyone and hides the ones the user lacks', () => {
    const nav = renderNav();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['الرئيسية', 'الفلوس']);
  });

  it('shows an item that needs a permission, in any scope unless the item names one', () => {
    held = { 'payments.read': 'own', 'reports.read': 'own' };
    const nav = renderNav();
    // payments.read has no scope on the item: any scope is enough. reports.read needs "any".
    expect(within(nav).getByRole('link', { name: 'المدفوعات' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'التقارير' })).not.toBeInTheDocument();

    held = { 'reports.read': 'any' };
  });

  it('shows an item that needs scope "any" when the user holds it', () => {
    held = { 'reports.read': 'any' };
    const nav = renderNav();
    expect(within(nav).getByRole('link', { name: 'التقارير' })).toBeInTheDocument();
  });

  it('keeps the search of an item on its link', () => {
    const nav = renderNav();
    expect(within(nav).getByRole('link', { name: 'الفلوس' })).toHaveAttribute(
      'href',
      '/reports/finance?from=2026-11-01',
    );
  });

  it('marks the current item, and an item with `end` only on its own path', () => {
    const nav = renderNav('/reports/finance');
    expect(within(nav).getByRole('link', { name: 'الفلوس' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // "/" is the start of every path but `end` keeps it from being current here.
    expect(within(nav).getByRole('link', { name: 'الرئيسية' })).not.toHaveAttribute('aria-current');
  });

  it('gives each link a title and a label that is only for screen readers on a phone', () => {
    const nav = renderNav();
    const home = within(nav).getByRole('link', { name: 'الرئيسية' });
    expect(home).toHaveAttribute('title', 'الرئيسية');
    expect(within(home).getByText('الرئيسية')).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(home.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('scrolls sideways inside itself and takes the width of its content', () => {
    const nav = renderNav();
    expect(nav).toHaveClass('mx-auto', 'w-full', 'max-w-7xl', 'overflow-x-auto', 'px-4');
  });
});
