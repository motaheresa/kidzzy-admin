import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Table, TableHeader, TableRow } from '../atoms/table';
import { SortableHead, type SortDirection } from './SortableHead';

function renderHead(direction: SortDirection | null, onSort = vi.fn()) {
  render(
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="الاسم" direction={direction} onSort={onSort} />
        </TableRow>
      </TableHeader>
    </Table>,
  );
  return onSort;
}

describe('SortableHead', () => {
  it.each([
    ['asc', 'ascending'],
    ['desc', 'descending'],
    [null, 'none'],
  ] as const)('says %s to assistive technology as aria-sort=%s', (direction, expected) => {
    renderHead(direction);
    expect(screen.getByRole('columnheader', { name: 'الاسم' })).toHaveAttribute(
      'aria-sort',
      expected,
    );
  });

  it('is a button that reports the click', async () => {
    const onSort = renderHead(null);
    await userEvent.click(screen.getByRole('button', { name: 'الاسم' }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it('can be pressed from the keyboard', async () => {
    const onSort = renderHead('asc');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'الاسم' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledOnce();
  });
});
