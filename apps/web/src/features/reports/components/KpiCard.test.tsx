import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { KpiCard } from './KpiCard';

function renderCard(props: Partial<Parameters<typeof KpiCard>[0]> = {}) {
  render(
    <MemoryRouter initialEntries={['/reports/students?from=2026-11-01']}>
      <KpiCard label="غياب متكرر" value="2" {...props} />
    </MemoryRouter>,
  );
}

describe('KpiCard', () => {
  it('shows the label, the value and the hint', () => {
    renderCard({ hint: '3 غيابات ورا بعض أو أكتر' });
    expect(screen.getByText('غياب متكرر')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 غيابات ورا بعض أو أكتر')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('is a link over the whole card when it has a destination', () => {
    renderCard({ to: { search: '?from=2026-11-01&repeated=1' } });
    const link = screen.getByRole('link', { name: 'غياب متكرر' });
    expect(link).toHaveAttribute('href', '/reports/students?from=2026-11-01&repeated=1');
    // The label is stretched over the card, so the whole card is the click target.
    expect(link.className).toContain('after:absolute');
    expect(link.className).toContain('after:inset-0');
  });
});
