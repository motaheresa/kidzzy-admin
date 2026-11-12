import type { SortDirection } from '@/components/ui';
import type { InstructorsReportRow } from '../types';

/** The columns of the instructors table that can be sorted. */
export const SORT_COLUMNS = [
  'name',
  'activeGroups',
  'held',
  'cancelled',
  'actualMinutes',
  'attendanceRate',
  'paid',
  'due',
  'expected',
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

/** Most held sessions first. */
export const DEFAULT_SORT: SortState = { column: 'held', direction: 'desc' };

/** The URL form, "held:desc". The default is not written to the URL. */
export function formatSort(state: SortState): string | null {
  if (state.column === DEFAULT_SORT.column && state.direction === DEFAULT_SORT.direction) {
    return null;
  }
  return `${state.column}:${state.direction}`;
}

/** Reads ?sort=; anything that is not a known column and direction is the default. */
export function parseSort(raw: string | null): SortState {
  const [column, direction] = (raw ?? '').split(':');
  const known = SORT_COLUMNS.find((candidate) => candidate === column);
  if (!known || (direction !== 'asc' && direction !== 'desc')) return DEFAULT_SORT;
  return { column: known, direction };
}

/** A column opens in the direction people want first: names A to Z, numbers highest first. */
function firstDirection(column: SortColumn): SortDirection {
  return column === 'name' ? 'asc' : 'desc';
}

/** Pressing the sorted column flips it; pressing another one starts it in its first direction. */
export function nextSort(current: SortState, column: SortColumn): SortState {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: firstDirection(column) };
}

/**
 * Money is a decimal string ("1500.00", "-0.50") and is compared exactly, as whole piasters, never
 * as a JS number.
 */
export function compareMoney(a: string, b: string): number {
  const left = BigInt(a.replace('.', ''));
  const right = BigInt(b.replace('.', ''));
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareValue(a: InstructorsReportRow, b: InstructorsReportRow, column: SortColumn) {
  switch (column) {
    case 'name':
      return a.name.localeCompare(b.name, 'ar');
    case 'paid':
    case 'expected':
      return compareMoney(a[column], b[column]);
    case 'due':
      return compareMoney(a.due.total, b.due.total) || a.due.count - b.due.count;
    case 'attendanceRate':
      return (a.attendanceRate ?? 0) - (b.attendanceRate ?? 0);
    default:
      return a[column] - b[column];
  }
}

/**
 * A sorted copy of the rows. A missing attendance rate goes last in both directions, and ties are
 * broken by name (A to Z), so the order never jumps between equal rows.
 */
export function sortInstructorRows(
  rows: readonly InstructorsReportRow[],
  { column, direction }: SortState,
): InstructorsReportRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (column === 'attendanceRate') {
      if (a.attendanceRate === null && b.attendanceRate !== null) return 1;
      if (a.attendanceRate !== null && b.attendanceRate === null) return -1;
    }
    return sign * compareValue(a, b, column) || a.name.localeCompare(b.name, 'ar');
  });
}
