import { PayeeType, type CycleChange } from '@kidzzy/shared';
import { formatSummary, reminderCandidates } from './payment-reminder.format';

function change(
  payeeType: PayeeType,
  sessionsCounted: number,
  overrides: Partial<CycleChange> = {},
): CycleChange {
  return {
    cycleId: `${payeeType}-${sessionsCounted}`,
    payeeType,
    studentId: payeeType === PayeeType.Student ? 'student-1' : null,
    sessionsPerCycle: 8,
    sessionsCounted,
    status: 'in_progress',
    ...overrides,
  } as CycleChange;
}

describe('payment reminder candidates', () => {
  const thresholds = { student: [2, 1], instructor: [3] };

  it('uses the student thresholds for a student and the instructor thresholds for an instructor', () => {
    const candidates = reminderCandidates(
      [
        change(PayeeType.Student, 6), // 2 left
        change(PayeeType.Student, 5), // 3 left: not a student threshold
        change(PayeeType.Instructor, 5), // 3 left: an instructor threshold
        change(PayeeType.Instructor, 6), // 2 left: not an instructor threshold
      ],
      thresholds,
    );
    expect(candidates.map((c) => [c.payeeType, c.sessionsLeft])).toEqual([
      [PayeeType.Student, 2],
      [PayeeType.Instructor, 3],
    ]);
  });

  it('always includes a cycle that became due, with no rule at all', () => {
    const candidates = reminderCandidates(
      [change(PayeeType.Student, 8, { status: 'due' }), change(PayeeType.Instructor, 8)],
      { student: [], instructor: [] },
    );
    expect(candidates.map((c) => c.sessionsLeft)).toEqual([0, 0]);
  });
});

describe('payment reminder text', () => {
  const names = new Map([['student-1', 'سلمى']]);
  const input = { groupName: 'سكواتش', instructorName: 'كريم' };
  const lines = (sessionsLefts: number[]) =>
    formatSummary(
      input,
      sessionsLefts.map((sessionsLeft) => ({
        cycleId: `c-${sessionsLeft}`,
        sessionsLeft,
        payeeType: PayeeType.Student,
        studentId: 'student-1',
      })),
      names,
    ).body.split('\n');

  it('keeps the text of the thresholds that were hardcoded before', () => {
    expect(lines([0, 1, 2])).toEqual(['فاضلهم حصتين: سلمى', 'فاضلهم حصة: سلمى', 'استحقت: سلمى']);
  });

  it('counts 3 to 10 with the plural and 11 and up with the singular, most left first', () => {
    expect(lines([1, 3, 11, 10])).toEqual([
      'فاضلهم 11 حصة: سلمى',
      'فاضلهم 10 حصص: سلمى',
      'فاضلهم 3 حصص: سلمى',
      'فاضلهم حصة: سلمى',
    ]);
  });
});
