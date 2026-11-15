import { REPEATED_ABSENCE_THRESHOLD } from '@kidzzy/shared';
import type { StudentsReportRow } from '../types';
import { compareWithNullsLast, createSort, type SortState as BaseSortState } from './sort';

/** The columns of the students table that can be sorted. */
export const STUDENT_SORT_COLUMNS = [
  'name',
  'group',
  'present',
  'absent',
  'attendanceRate',
  'absenceStreak',
  'lastPresentAt',
  'averagePerformance',
  'averageHomework',
  'cycle',
] as const;
export type StudentSortColumn = (typeof STUDENT_SORT_COLUMNS)[number];
export type StudentSortState = BaseSortState<StudentSortColumn>;

/** The longest absence streak first: who needs a call comes first. */
export const DEFAULT_STUDENT_SORT: StudentSortState = {
  column: 'absenceStreak',
  direction: 'desc',
};

// Names and groups open A to Z, numbers and dates highest (latest) first.
const sort = createSort(STUDENT_SORT_COLUMNS, DEFAULT_STUDENT_SORT, (column) =>
  column === 'name' || column === 'group' ? 'asc' : 'desc',
);
export const formatStudentSort = sort.format;
export const parseStudentSort = sort.parse;
export const nextStudentSort = sort.next;

const byNumber = (a: number, b: number) => a - b;

/**
 * A sorted copy of the rows. A missing value (no group, no rating, never present, no cycle) goes
 * last in both directions, and ties are broken by name (A to Z), so equal rows never jump around.
 */
export function sortStudentRows(
  rows: readonly StudentsReportRow[],
  { column, direction }: StudentSortState,
): StudentsReportRow[] {
  const compare = (a: StudentsReportRow, b: StudentsReportRow): number => {
    switch (column) {
      case 'name':
        return compareWithNullsLast(a.name, b.name, direction, (x, y) => x.localeCompare(y, 'ar'));
      case 'group':
        return compareWithNullsLast(
          a.currentGroup?.name ?? null,
          b.currentGroup?.name ?? null,
          direction,
          (x, y) => x.localeCompare(y, 'ar'),
        );
      case 'lastPresentAt':
        // ISO 8601 in UTC sorts as text.
        return compareWithNullsLast(a.lastPresentAt, b.lastPresentAt, direction, (x, y) =>
          x < y ? -1 : x > y ? 1 : 0,
        );
      case 'cycle':
        return compareWithNullsLast(a.cycle, b.cycle, direction, (x, y) =>
          // counted/perCycle compared without dividing: x.c / x.p against y.c / y.p.
          byNumber(x.sessionsCounted * y.sessionsPerCycle, y.sessionsCounted * x.sessionsPerCycle),
        );
      case 'attendanceRate':
      case 'averagePerformance':
      case 'averageHomework':
        return compareWithNullsLast(a[column], b[column], direction, byNumber);
      default:
        return compareWithNullsLast(a[column], b[column], direction, byNumber);
    }
  };
  return [...rows].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name, 'ar'));
}

/** The filters of the students table, as read from the URL. */
export interface StudentFilters {
  groupId?: string;
  /** true: only students whose stored flag is active; false: only inactive; undefined: all. */
  active?: boolean;
  /** Only students with a repeated absence (a streak of REPEATED_ABSENCE_THRESHOLD or more). */
  repeated?: boolean;
}

/** The rows that pass every filter that is set. */
export function filterStudentRows(
  rows: readonly StudentsReportRow[],
  { groupId, active, repeated }: StudentFilters,
): StudentsReportRow[] {
  return rows.filter(
    (row) =>
      (groupId === undefined || row.currentGroup?.id === groupId) &&
      (active === undefined || row.isActive === active) &&
      (!repeated || row.absenceStreak >= REPEATED_ABSENCE_THRESHOLD),
  );
}
