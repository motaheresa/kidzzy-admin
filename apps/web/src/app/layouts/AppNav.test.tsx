import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNav } from './AppNav';

let held: Record<string, 'any' | 'own'> = {};
vi.mock('@/features/auth', () => ({
  usePermissions: () => ({
    can: (action: string) => action in held,
    scopeFor: (action: string) => held[action] ?? null,
  }),
}));

function renderNav(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'الأقسام' });
}

beforeEach(() => {
  held = {};
});

// AppNav now draws through the shared SectionNav. These tests pin what it drew before, so the
// look of the app does not change.
describe('AppNav', () => {
  it('shows only the home link to a user with no permission', () => {
    const nav = renderNav();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['الرئيسية']);
  });

  it('shows every section, in order, to an admin', () => {
    held = {
      'groups.read': 'any',
      'students.read': 'any',
      'instructors.read': 'any',
      'payments.read': 'any',
      'reports.read': 'any',
      'announcements.send': 'any',
      'audit.read': 'any',
      'reminders.manage': 'any',
    };
    const nav = renderNav();
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'الرئيسية',
      'الجروبات',
      'الطلاب',
      'المدرسين',
      'المدفوعات',
      'التقارير',
      'الاعلانات',
      'سجل التغييرات',
      'قواعد التذكير',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/groups',
      '/students',
      '/instructors',
      '/payments',
      '/reports',
      '/announcements',
      '/audit-log',
      '/reminder-rules',
    ]);
  });

  it('shows the admin-only sections only with scope any', () => {
    held = { 'payments.read': 'own', 'reports.read': 'own', 'groups.read': 'own' };
    const nav = renderNav();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['الرئيسية', 'الجروبات']);
  });

  it('keeps the markup and the classes of the app navigation', () => {
    held = { 'groups.read': 'any' };
    const nav = renderNav('/groups');
    expect(nav).toHaveAttribute('aria-label', 'الأقسام');
    expect(nav.className).toBe('mx-auto w-full max-w-5xl overflow-x-auto px-4');
    expect(nav.querySelector('ul')?.className).toBe(
      'flex justify-between gap-1 pb-2 sm:justify-start',
    );

    const groups = within(nav).getByRole('link', { name: 'الجروبات' });
    expect(groups).toHaveAttribute('aria-current', 'page');
    expect(groups).toHaveAttribute('title', 'الجروبات');
    expect(groups.className).toBe(
      'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast ease-out bg-secondary text-secondary-foreground',
    );
    const home = within(nav).getByRole('link', { name: 'الرئيسية' });
    expect(home).not.toHaveAttribute('aria-current');
    expect(home.className).toContain('text-muted-foreground hover:bg-muted hover:text-foreground');
    expect(groups.querySelector('svg')?.getAttribute('class')).toContain('size-5 shrink-0');
    expect(within(groups).getByText('الجروبات').className).toBe('sr-only sm:not-sr-only');
  });

  it('is current on the home page only on "/"', () => {
    held = { 'groups.read': 'any' };
    const nav = renderNav('/');
    expect(within(nav).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'الجروبات' })).not.toHaveAttribute('aria-current');
  });
});
