import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignSystemPage } from './DesignSystemPage';

// Smoke test: the dev preview renders every section without throwing. jsdom has no CSS, so the
// token values are empty here; the contrast numbers themselves are tested in tokens.test.ts.
describe('DesignSystemPage (dev)', () => {
  it('renders every section', () => {
    render(<DesignSystemPage />);
    for (const title of [
      'الألوان',
      'الخطوط والأحجام',
      'Buttons',
      'Form fields',
      'Alerts',
      'Badges',
      'Card, Skeleton, Spinner',
      'Empty state',
      'Toasts',
      'Full-screen states',
      'Motion',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });
});
