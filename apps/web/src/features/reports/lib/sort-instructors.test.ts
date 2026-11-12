import { describe, expect, it } from 'vitest';
import type { InstructorsReportRow } from '../types';
import {
  compareMoney,
  DEFAULT_SORT,
  formatSort,
  nextSort,
  parseSort,
  sortInstructorRows,
} from './sort-instructors';

function row(name: string, over: Partial<InstructorsReportRow> = {}): InstructorsReportRow {
  return {
    instructorId: `id-${name}`,
    name,
    isActive: true,
    activeGroups: 1,
    held: 0,
    cancelled: 0,
    actualMinutes: 0,
    heldWithoutActualTimes: 0,
    attendanceRate: null,
    paid: '0.00',
    due: { count: 0, total: '0.00' },
    expected: '0.00',
    ...over,
  };
}

const names = (rows: InstructorsReportRow[]) => rows.map((r) => r.name);

describe('the sort in the URL', () => {
  it('is held, highest first, by default and then not written to the URL', () => {
    expect(parseSort(null)).toEqual(DEFAULT_SORT);
    expect(DEFAULT_SORT).toEqual({ column: 'held', direction: 'desc' });
    expect(formatSort(DEFAULT_SORT)).toBeNull();
  });

  it('round-trips a column and a direction', () => {
    expect(formatSort({ column: 'paid', direction: 'asc' })).toBe('paid:asc');
    expect(parseSort('paid:asc')).toEqual({ column: 'paid', direction: 'asc' });
  });

  it('falls back to the default for an unknown column or direction', () => {
    expect(parseSort('salary:desc')).toEqual(DEFAULT_SORT);
    expect(parseSort('paid:sideways')).toEqual(DEFAULT_SORT);
    expect(parseSort('paid')).toEqual(DEFAULT_SORT);
  });
});

describe('nextSort', () => {
  it('flips the sorted column', () => {
    expect(nextSort({ column: 'held', direction: 'desc' }, 'held')).toEqual({
      column: 'held',
      direction: 'asc',
    });
    expect(nextSort({ column: 'held', direction: 'asc' }, 'held')).toEqual({
      column: 'held',
      direction: 'desc',
    });
  });

  it('starts names A to Z and numbers highest first', () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ column: 'name', direction: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'paid')).toEqual({ column: 'paid', direction: 'desc' });
  });
});

describe('compareMoney', () => {
  it('compares decimal strings exactly, negatives included', () => {
    expect(compareMoney('1500.00', '1500.00')).toBe(0);
    expect(compareMoney('999.99', '1000.00')).toBe(-1);
    expect(compareMoney('1000.01', '1000.00')).toBe(1);
    expect(compareMoney('-300.00', '200.00')).toBe(-1);
    expect(compareMoney('-0.50', '-0.10')).toBe(-1);
  });

  it('does not lose a piaster on a large amount', () => {
    expect(compareMoney('99999999.99', '99999999.98')).toBe(1);
  });
});

describe('sortInstructorRows', () => {
  it('sorts numbers both ways, ties by name', () => {
    const rows = [row('Omar', { held: 3 }), row('Ana', { held: 5 }), row('Dina', { held: 3 })];
    expect(names(sortInstructorRows(rows, { column: 'held', direction: 'desc' }))).toEqual([
      'Ana',
      'Dina',
      'Omar',
    ]);
    expect(names(sortInstructorRows(rows, { column: 'held', direction: 'asc' }))).toEqual([
      'Dina',
      'Omar',
      'Ana',
    ]);
  });

  it('sorts money exactly', () => {
    const rows = [
      row('A', { paid: '1000.00' }),
      row('B', { paid: '999.99' }),
      row('C', { paid: '1000.01' }),
    ];
    expect(names(sortInstructorRows(rows, { column: 'paid', direction: 'desc' }))).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('sorts expected, including a negative one, and due by its total', () => {
    const rows = [
      row('A', { expected: '-100.00', due: { count: 1, total: '500.00' } }),
      row('B', { expected: '200.00', due: { count: 2, total: '300.00' } }),
    ];
    expect(names(sortInstructorRows(rows, { column: 'expected', direction: 'asc' }))).toEqual([
      'A',
      'B',
    ]);
    expect(names(sortInstructorRows(rows, { column: 'due', direction: 'desc' }))).toEqual([
      'A',
      'B',
    ]);
  });

  it('puts a missing attendance rate last in both directions', () => {
    const rows = [
      row('A', { attendanceRate: null }),
      row('B', { attendanceRate: 90 }),
      row('C', { attendanceRate: 60.5 }),
    ];
    expect(
      names(sortInstructorRows(rows, { column: 'attendanceRate', direction: 'desc' })),
    ).toEqual(['B', 'C', 'A']);
    expect(names(sortInstructorRows(rows, { column: 'attendanceRate', direction: 'asc' }))).toEqual(
      ['C', 'B', 'A'],
    );
  });

  it('sorts Arabic names', () => {
    const rows = [row('منى'), row('أحمد'), row('بسمة')];
    expect(names(sortInstructorRows(rows, { column: 'name', direction: 'asc' }))).toEqual([
      'أحمد',
      'بسمة',
      'منى',
    ]);
  });

  it('does not change the rows it is given', () => {
    const rows = [row('B', { held: 1 }), row('A', { held: 2 })];
    sortInstructorRows(rows, { column: 'held', direction: 'desc' });
    expect(names(rows)).toEqual(['B', 'A']);
  });
});
