import { describe, expect, it } from 'vitest';
import type { StudentsReportRow } from '../types';
import { createSort, compareWithNullsLast } from './sort';
import {
  DEFAULT_STUDENT_SORT,
  filterStudentRows,
  formatStudentSort,
  nextStudentSort,
  parseStudentSort,
  sortStudentRows,
} from './sort-students';

function row(name: string, over: Partial<StudentsReportRow> = {}): StudentsReportRow {
  return {
    studentId: `id-${name}`,
    name,
    isActive: true,
    currentGroup: { id: 'g1', name: 'Scratch A' },
    present: 0,
    absent: 0,
    attendanceRate: null,
    absenceStreak: 0,
    lastPresentAt: null,
    averagePerformance: null,
    averageHomework: null,
    cycle: null,
    ...over,
  };
}
const names = (rows: StudentsReportRow[]) => rows.map((r) => r.name);

describe('createSort', () => {
  const sort = createSort(['a', 'b'] as const, { column: 'a', direction: 'desc' }, (column) =>
    column === 'b' ? 'asc' : 'desc',
  );

  it('does not write the default to the URL, and reads an unknown value as the default', () => {
    expect(sort.format({ column: 'a', direction: 'desc' })).toBeNull();
    expect(sort.format({ column: 'a', direction: 'asc' })).toBe('a:asc');
    expect(sort.parse('b:asc')).toEqual({ column: 'b', direction: 'asc' });
    expect(sort.parse('c:asc')).toEqual({ column: 'a', direction: 'desc' });
    expect(sort.parse(null)).toEqual({ column: 'a', direction: 'desc' });
  });

  it('flips the sorted column and opens another in its first direction', () => {
    expect(sort.next({ column: 'a', direction: 'desc' }, 'a').direction).toBe('asc');
    expect(sort.next({ column: 'a', direction: 'desc' }, 'b')).toEqual({
      column: 'b',
      direction: 'asc',
    });
  });
});

describe('compareWithNullsLast', () => {
  it('puts a missing value last whichever way it is sorted', () => {
    const numbers = (a: number, b: number) => a - b;
    expect(compareWithNullsLast(null, 1, 'asc', numbers)).toBeGreaterThan(0);
    expect(compareWithNullsLast(null, 1, 'desc', numbers)).toBeGreaterThan(0);
    expect(compareWithNullsLast(1, null, 'desc', numbers)).toBeLessThan(0);
    expect(compareWithNullsLast(null, null, 'asc', numbers)).toBe(0);
    expect(compareWithNullsLast(1, 2, 'desc', numbers)).toBeGreaterThan(0);
  });
});

describe('the students sort in the URL', () => {
  it('is the longest absence streak first by default', () => {
    expect(DEFAULT_STUDENT_SORT).toEqual({ column: 'absenceStreak', direction: 'desc' });
    expect(parseStudentSort(null)).toEqual(DEFAULT_STUDENT_SORT);
    expect(formatStudentSort(DEFAULT_STUDENT_SORT)).toBeNull();
    expect(parseStudentSort('lastPresentAt:asc')).toEqual({
      column: 'lastPresentAt',
      direction: 'asc',
    });
    expect(parseStudentSort('salary:asc')).toEqual(DEFAULT_STUDENT_SORT);
  });

  it('opens names and groups A to Z and the rest highest first', () => {
    expect(nextStudentSort(DEFAULT_STUDENT_SORT, 'name').direction).toBe('asc');
    expect(nextStudentSort(DEFAULT_STUDENT_SORT, 'group').direction).toBe('asc');
    expect(nextStudentSort(DEFAULT_STUDENT_SORT, 'present').direction).toBe('desc');
  });
});

describe('sortStudentRows', () => {
  it('sorts numbers both ways, ties by name', () => {
    const rows = [
      row('Omar', { absenceStreak: 2 }),
      row('Ana', { absenceStreak: 4 }),
      row('Dina', { absenceStreak: 2 }),
    ];
    expect(names(sortStudentRows(rows, { column: 'absenceStreak', direction: 'desc' }))).toEqual([
      'Ana',
      'Dina',
      'Omar',
    ]);
    expect(names(sortStudentRows(rows, { column: 'absenceStreak', direction: 'asc' }))).toEqual([
      'Dina',
      'Omar',
      'Ana',
    ]);
  });

  it('puts a missing rate, rating, last present date, group and cycle last in both directions', () => {
    const rows = [
      row('A', { attendanceRate: null, currentGroup: null, lastPresentAt: null, cycle: null }),
      row('B', {
        attendanceRate: 90,
        currentGroup: { id: 'g2', name: 'B group' },
        lastPresentAt: '2026-11-10T15:00:00.000Z',
        cycle: { sessionsCounted: 3, sessionsPerCycle: 4, status: 'in_progress' },
      }),
      row('C', {
        attendanceRate: 60,
        currentGroup: { id: 'g1', name: 'A group' },
        lastPresentAt: '2026-11-03T15:00:00.000Z',
        cycle: { sessionsCounted: 1, sessionsPerCycle: 4, status: 'in_progress' },
      }),
    ];
    for (const column of ['attendanceRate', 'group', 'lastPresentAt', 'cycle'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(names(sortStudentRows(rows, { column, direction })).at(-1)).toBe('A');
      }
    }
    expect(names(sortStudentRows(rows, { column: 'lastPresentAt', direction: 'desc' }))).toEqual([
      'B',
      'C',
      'A',
    ]);
    expect(names(sortStudentRows(rows, { column: 'group', direction: 'asc' }))).toEqual([
      'C',
      'B',
      'A',
    ]);
  });

  it('sorts a cycle by how full it is, across different cycle sizes', () => {
    const rows = [
      row('Half', { cycle: { sessionsCounted: 2, sessionsPerCycle: 4, status: 'in_progress' } }),
      row('Third', { cycle: { sessionsCounted: 4, sessionsPerCycle: 12, status: 'in_progress' } }),
      row('Full', { cycle: { sessionsCounted: 8, sessionsPerCycle: 8, status: 'due' } }),
    ];
    expect(names(sortStudentRows(rows, { column: 'cycle', direction: 'desc' }))).toEqual([
      'Full',
      'Half',
      'Third',
    ]);
  });

  it('sorts Arabic names and does not change the rows it is given', () => {
    const rows = [row('منى'), row('أحمد'), row('بسمة')];
    expect(names(sortStudentRows(rows, { column: 'name', direction: 'asc' }))).toEqual([
      'أحمد',
      'بسمة',
      'منى',
    ]);
    expect(names(rows)).toEqual(['منى', 'أحمد', 'بسمة']);
  });
});

describe('filterStudentRows', () => {
  const rows = [
    row('Ana', { absenceStreak: 3 }),
    row('Omar', {
      absenceStreak: 2,
      isActive: false,
      currentGroup: { id: 'g2', name: 'Scratch B' },
    }),
    row('Zed', { absenceStreak: 5, currentGroup: null }),
  ];

  it('keeps everything with no filter', () => {
    expect(filterStudentRows(rows, {})).toHaveLength(3);
  });

  it('filters by group, by the active flag and by repeated absence', () => {
    expect(names(filterStudentRows(rows, { groupId: 'g1' }))).toEqual(['Ana']);
    expect(names(filterStudentRows(rows, { active: false }))).toEqual(['Omar']);
    expect(names(filterStudentRows(rows, { active: true }))).toEqual(['Ana', 'Zed']);
    expect(names(filterStudentRows(rows, { repeated: true }))).toEqual(['Ana', 'Zed']);
  });

  it('treats a streak of exactly three as repeated and two as not', () => {
    expect(
      names(filterStudentRows([row('Two', { absenceStreak: 2 })], { repeated: true })),
    ).toEqual([]);
    expect(
      names(filterStudentRows([row('Three', { absenceStreak: 3 })], { repeated: true })),
    ).toEqual(['Three']);
  });

  it('combines the filters', () => {
    expect(names(filterStudentRows(rows, { active: true, repeated: true, groupId: 'g1' }))).toEqual(
      ['Ana'],
    );
  });
});
