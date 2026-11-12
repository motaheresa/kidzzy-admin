import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableHead } from '../atoms/table';

/** Which way a table is sorted by a column. */
export type SortDirection = 'asc' | 'desc';

/**
 * A column header that sorts the table when it is pressed. The `th` says the state to assistive
 * technology (`aria-sort`); the button inside is at least 44 px tall and shows an arrow for the
 * active direction, and a faint up-and-down mark when the column is not the sorted one. It only
 * reports the click: the screen decides the next direction and keeps it (for example in the URL).
 */
export function SortableHead({
  label,
  direction,
  onSort,
  className,
}: {
  label: string;
  /** The direction when this column is the sorted one; null otherwise. */
  direction: SortDirection | null;
  onSort: () => void;
  className?: string;
}) {
  const Icon =
    direction === 'asc' ? ArrowUpIcon : direction === 'desc' ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <TableHead
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={cn('p-0', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'inline-flex h-11 w-full items-center gap-1 rounded-md px-3 text-start text-xs font-semibold whitespace-nowrap hover:text-foreground',
          direction ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn('size-3.5', !direction && 'opacity-50')} />
      </button>
    </TableHead>
  );
}
