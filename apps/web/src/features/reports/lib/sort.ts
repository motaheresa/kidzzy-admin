import type { SortDirection } from '@/components/ui';

/** The column a table is sorted by, and which way. */
export interface SortState<Column extends string> {
  column: Column;
  direction: SortDirection;
}

/**
 * The sort of a table kept in the URL as one param, "held:desc". Each table says its columns, its
 * default and which way a column opens first (names A to Z, numbers highest first); the rest is
 * the same everywhere: the default is not written to the URL, anything unknown reads as the
 * default, and pressing the sorted column flips it while pressing another one starts it afresh.
 */
export function createSort<Column extends string>(
  columns: readonly Column[],
  defaultSort: SortState<Column>,
  firstDirection: (column: Column) => SortDirection,
) {
  return {
    defaultSort,

    /** The URL form; null for the default (not written to the URL). */
    format(state: SortState<Column>): string | null {
      return state.column === defaultSort.column && state.direction === defaultSort.direction
        ? null
        : `${state.column}:${state.direction}`;
    },

    /** Reads ?sort=; anything that is not a known column and direction is the default. */
    parse(raw: string | null): SortState<Column> {
      const [column, direction] = (raw ?? '').split(':');
      const known = columns.find((candidate) => candidate === column);
      if (!known || (direction !== 'asc' && direction !== 'desc')) return defaultSort;
      return { column: known, direction };
    },

    /** Pressing the sorted column flips it; pressing another one starts it in its first direction. */
    next(current: SortState<Column>, column: Column): SortState<Column> {
      if (current.column === column) {
        return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: firstDirection(column) };
    },
  };
}

/** Compares two numbers, with a missing one (null) going last whichever way the table is sorted. */
export function compareWithNullsLast<T>(
  a: T | null,
  b: T | null,
  direction: SortDirection,
  compare: (left: T, right: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (direction === 'asc' ? 1 : -1) * compare(a, b);
}
