import {
  buildStudentStats,
  type StatAttendance,
  type StatCycle,
  type StatEnrollment,
  type StatStudent,
  type StudentStatsInput,
} from './student-stats';

const ZONE = 'Africa/Cairo';
const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' };

const student = (id: string, name = id, isActive = true): StatStudent => ({ id, name, isActive });

const group = { id: 'g1', name: 'Scratch A' };
const enrolled = (
  studentId: string,
  startDate: string,
  endDate: string | null = null,
): StatEnrollment => ({ studentId, startDate, endDate, group });

let counter = 0;
function mark(
  studentId: string,
  at: string,
  status: 'present' | 'absent',
  ratings: { performance?: number | null; homework?: number | null } = {},
  sessionId?: string,
): StatAttendance {
  counter += 1;
  return {
    studentId,
    sessionId: sessionId ?? `s${String(counter).padStart(4, '0')}`,
    scheduledAt: new Date(at),
    status,
    performanceRating: ratings.performance ?? null,
    homeworkRating: ratings.homework ?? null,
  };
}

function stats(overrides: Partial<StudentStatsInput> = {}) {
  return buildStudentStats({
    students: [],
    enrollments: [],
    attendance: [],
    cycles: [],
    period: NOVEMBER,
    zone: ZONE,
    ...overrides,
  });
}

const row = (result: ReturnType<typeof stats>, id: string) =>
  result.rows.find((r) => r.studentId === id);

describe('buildStudentStats', () => {
  describe('joined and left', () => {
    it('counts a first enrollment that starts on either edge of the period, not the days around', () => {
      const result = stats({
        enrollments: [
          enrolled('before', '2026-10-31'),
          enrolled('first-day', '2026-11-01'),
          enrolled('last-day', '2026-11-30'),
          enrolled('after', '2026-12-01'),
        ],
      });
      expect(result.kpis.joined).toBe(2);
    });

    it('counts a student whose latest enrollment ended in the period, edges included', () => {
      const result = stats({
        enrollments: [
          enrolled('before', '2026-01-01', '2026-10-31'),
          enrolled('first-day', '2026-01-01', '2026-11-01'),
          enrolled('last-day', '2026-01-01', '2026-11-30'),
          enrolled('after', '2026-01-01', '2026-12-01'),
        ],
      });
      expect(result.kpis.left).toBe(2);
      expect(result.kpis.activeStudents).toBe(0);
    });

    it('does not count as left a student who came back (an open enrollment)', () => {
      const result = stats({
        enrollments: [enrolled('back', '2026-01-01', '2026-11-05'), enrolled('back', '2026-11-10')],
      });
      expect(result.kpis.left).toBe(0);
      expect(result.kpis.activeStudents).toBe(1);
    });

    it('lets the first enrollment decide joined, and the latest decide left', () => {
      const result = stats({
        enrollments: [
          // Left in August, came back in November, still here: joined in August, not in the period.
          enrolled('returned', '2026-05-01', '2026-08-01'),
          enrolled('returned', '2026-11-05'),
          // Two closed enrollments: the latest one ended in the period.
          enrolled('twice', '2026-01-01', '2026-03-01'),
          enrolled('twice', '2026-04-01', '2026-11-12'),
        ],
      });
      expect(result.kpis.joined).toBe(0);
      expect(result.kpis.left).toBe(1);
    });

    it('counts a student who joined and left inside the period as both', () => {
      const result = stats({ enrollments: [enrolled('quick', '2026-11-03', '2026-11-20')] });
      expect(result.kpis).toMatchObject({ joined: 1, left: 1, activeStudents: 0 });
    });
  });

  describe('absence streak', () => {
    it('counts consecutive absences back from the latest row, across the period boundary', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-09-01')],
        attendance: [
          mark('a', '2026-10-28T15:00:00.000Z', 'absent'), // before the period
          mark('a', '2026-10-30T15:00:00.000Z', 'absent'), // before the period
          mark('a', '2026-11-03T15:00:00.000Z', 'absent'), // in the period
        ],
      });
      // Only one absence is in the period, but the streak looks back over all time.
      expect(row(result, 'a')).toMatchObject({ absent: 1, absenceStreak: 3 });
    });

    it('is reset by a present row, and counts only what came after it', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-09-01')],
        attendance: [
          mark('a', '2026-10-20T15:00:00.000Z', 'absent'),
          mark('a', '2026-10-27T15:00:00.000Z', 'absent'),
          mark('a', '2026-11-03T15:00:00.000Z', 'present'),
          mark('a', '2026-11-10T15:00:00.000Z', 'absent'),
        ],
      });
      expect(row(result, 'a')?.absenceStreak).toBe(1);
    });

    it('is zero when the latest row is present, and zero with no rows at all', () => {
      const result = stats({
        students: [student('a'), student('b')],
        enrollments: [enrolled('a', '2026-09-01'), enrolled('b', '2026-09-01')],
        attendance: [
          mark('a', '2026-11-03T15:00:00.000Z', 'absent'),
          mark('a', '2026-11-10T15:00:00.000Z', 'present'),
        ],
      });
      expect(row(result, 'a')?.absenceStreak).toBe(0);
      expect(row(result, 'b')).toMatchObject({ absenceStreak: 0, lastPresentAt: null });
    });

    it('orders by scheduled_at, not by the order of the rows, and breaks a tie by session id', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-09-01')],
        attendance: [
          // Given newest first and oldest last on purpose.
          mark('a', '2026-11-10T15:00:00.000Z', 'absent'),
          mark('a', '2026-11-03T15:00:00.000Z', 'present'),
          // Same instant: the higher session id is "later".
          mark('a', '2026-11-12T15:00:00.000Z', 'present', {}, 'a-1'),
          mark('a', '2026-11-12T15:00:00.000Z', 'absent', {}, 'a-2'),
        ],
      });
      expect(row(result, 'a')?.absenceStreak).toBe(1); // a-2 is absent, then a-1 present
    });

    it('counts the students at or over the threshold of three as repeated absence', () => {
      const absences = (id: string, count: number) =>
        Array.from({ length: count }, (_, index) =>
          mark(id, `2026-11-${String(index + 2).padStart(2, '0')}T15:00:00.000Z`, 'absent'),
        );
      const result = stats({
        students: [student('two'), student('three'), student('four')],
        enrollments: [
          enrolled('two', '2026-09-01'),
          enrolled('three', '2026-09-01'),
          enrolled('four', '2026-09-01'),
        ],
        attendance: [...absences('two', 2), ...absences('three', 3), ...absences('four', 4)],
      });
      expect(result.kpis.repeatedAbsence).toBe(2);
    });
  });

  describe('last present', () => {
    it('is the latest session they attended, even before the period', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [
          mark('a', '2026-09-15T15:00:00.000Z', 'present'),
          mark('a', '2026-10-01T15:00:00.000Z', 'present'),
          mark('a', '2026-11-03T15:00:00.000Z', 'absent'),
        ],
      });
      expect(row(result, 'a')?.lastPresentAt).toBe('2026-10-01T15:00:00.000Z');
    });
  });

  describe('ratings', () => {
    it('averages the non-null ratings of the period to one decimal, and never counts no homework', () => {
      const result = stats({
        students: [student('a'), student('b')],
        enrollments: [enrolled('a', '2026-01-01'), enrolled('b', '2026-01-01')],
        attendance: [
          mark('a', '2026-11-02T15:00:00.000Z', 'present', { performance: 4, homework: null }),
          mark('a', '2026-11-03T15:00:00.000Z', 'present', { performance: 4, homework: 3 }),
          mark('b', '2026-11-02T15:00:00.000Z', 'present', { performance: 5, homework: 4 }),
          mark('b', '2026-11-04T15:00:00.000Z', 'absent'), // absent: never rated
        ],
      });
      expect(result.kpis.averagePerformance).toBe(4.3); // (4 + 4 + 5) / 3
      expect(result.kpis.averageHomework).toBe(3.5); // (3 + 4) / 2: the null is left out
      expect(row(result, 'a')).toMatchObject({ averagePerformance: 4, averageHomework: 3 });
      expect(row(result, 'b')).toMatchObject({ averagePerformance: 5, averageHomework: 4 });
    });

    it('leaves out ratings of rows outside the period', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [
          mark('a', '2026-10-20T15:00:00.000Z', 'present', { performance: 1, homework: 1 }),
          mark('a', '2026-11-02T15:00:00.000Z', 'present', { performance: 5, homework: 5 }),
        ],
      });
      expect(result.kpis).toMatchObject({ averagePerformance: 5, averageHomework: 5 });
    });

    it('is null when there is no rating at all', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [mark('a', '2026-11-02T15:00:00.000Z', 'present')],
      });
      expect(result.kpis).toMatchObject({ averagePerformance: null, averageHomework: null });
      expect(row(result, 'a')).toMatchObject({ averagePerformance: null, averageHomework: null });
    });
  });

  describe('attendance rate', () => {
    it('is present over present plus absent with one decimal, null with no rows', () => {
      const result = stats({
        students: [student('a'), student('b')],
        enrollments: [enrolled('a', '2026-01-01'), enrolled('b', '2026-01-01')],
        attendance: [
          mark('a', '2026-11-02T15:00:00.000Z', 'present'),
          mark('a', '2026-11-03T15:00:00.000Z', 'present'),
          mark('a', '2026-11-04T15:00:00.000Z', 'absent'),
        ],
      });
      expect(result.kpis).toMatchObject({ present: 2, absent: 1, attendanceRate: 66.7 });
      expect(row(result, 'a')?.attendanceRate).toBe(66.7);
      expect(row(result, 'b')?.attendanceRate).toBeNull();
    });

    it('is null for the whole academy when nothing was marked', () => {
      expect(stats().kpis).toMatchObject({ present: 0, absent: 0, attendanceRate: null });
    });
  });

  describe('buckets', () => {
    it('puts a 23:30 session on its own local day and 00:30 on the next', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [
          // Cairo is UTC+2 in November: 21:30Z is 23:30 on the 3rd, 22:30Z is 00:30 on the 4th.
          mark('a', '2026-11-03T21:30:00.000Z', 'present'),
          mark('a', '2026-11-03T22:30:00.000Z', 'absent'),
        ],
      });
      expect(result.buckets.find((b) => b.key === '2026-11-03')).toEqual({
        key: '2026-11-03',
        present: 1,
        absent: 0,
      });
      expect(result.buckets.find((b) => b.key === '2026-11-04')).toEqual({
        key: '2026-11-04',
        present: 0,
        absent: 1,
      });
    });

    it('has a bucket for every day, empty ones too, and counts only rows inside the period', () => {
      const result = stats({
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [
          mark('a', '2026-10-31T21:30:00.000Z', 'present'), // 23:30 on 31 Oct: outside
          mark('a', '2026-11-30T21:30:00.000Z', 'present'), // 23:30 on 30 Nov: inside
          mark('a', '2026-11-30T22:30:00.000Z', 'present'), // 00:30 on 1 Dec: outside
        ],
      });
      expect(result.granularity).toBe('day');
      expect(result.buckets).toHaveLength(30);
      expect(result.buckets.reduce((sum, b) => sum + b.present, 0)).toBe(1);
      expect(result.kpis.present).toBe(1);
    });

    it('is daily at 62 days and monthly at 63, with empty months', () => {
      const sixtyTwo = stats({ period: { from: '2026-10-01', to: '2026-12-01' } });
      expect(sixtyTwo.granularity).toBe('day');
      expect(sixtyTwo.buckets).toHaveLength(62);

      const sixtyThree = stats({
        period: { from: '2026-10-01', to: '2026-12-02' },
        students: [student('a')],
        enrollments: [enrolled('a', '2026-01-01')],
        attendance: [mark('a', '2026-10-10T15:00:00.000Z', 'present')],
      });
      expect(sixtyThree.granularity).toBe('month');
      expect(sixtyThree.buckets).toEqual([
        { key: '2026-10', present: 1, absent: 0 },
        { key: '2026-11', present: 0, absent: 0 },
        { key: '2026-12', present: 0, absent: 0 },
      ]);
    });
  });

  describe('which students are listed', () => {
    it('lists a student with an open enrollment, even without attendance', () => {
      const result = stats({
        students: [student('a', 'Aya')],
        enrollments: [enrolled('a', '2026-10-01')],
      });
      expect(row(result, 'a')).toMatchObject({
        name: 'Aya',
        currentGroup: { id: 'g1', name: 'Scratch A' },
        present: 0,
        absent: 0,
        attendanceRate: null,
        absenceStreak: 0,
      });
    });

    it('lists a former student with attendance in the period, and not one without', () => {
      const result = stats({
        students: [student('former'), student('gone')],
        enrollments: [
          enrolled('former', '2026-01-01', '2026-11-15'),
          enrolled('gone', '2026-01-01', '2026-09-30'),
        ],
        attendance: [
          mark('former', '2026-11-03T15:00:00.000Z', 'present'),
          mark('gone', '2026-09-20T15:00:00.000Z', 'absent'), // before the period
        ],
      });
      expect(result.rows.map((r) => r.studentId)).toEqual(['former']);
      expect(row(result, 'former')?.currentGroup).toBeNull();
    });

    it('keeps the stored active flag, which can differ from having an open enrollment', () => {
      const result = stats({
        students: [student('a', 'A', false)],
        enrollments: [enrolled('a', '2026-01-01')],
      });
      expect(row(result, 'a')?.isActive).toBe(false);
      expect(result.kpis.activeStudents).toBe(1);
    });

    it('orders the rows by name', () => {
      const result = stats({
        students: [student('b', 'Omar'), student('a', 'Ana')],
        enrollments: [enrolled('a', '2026-01-01'), enrolled('b', '2026-01-01')],
      });
      expect(result.rows.map((r) => r.name)).toEqual(['Ana', 'Omar']);
    });
  });

  describe('the cycle column', () => {
    const cycle = (over: Partial<StatCycle>): StatCycle => ({
      studentId: 'a',
      status: 'in_progress',
      sessionsCounted: 2,
      sessionsPerCycle: 4,
      cycleNumber: 1,
      ...over,
    });
    const rowWith = (cycles: StatCycle[]) =>
      row(
        stats({
          students: [student('a')],
          enrollments: [enrolled('a', '2026-01-01')],
          cycles,
        }),
        'a',
      )?.cycle;

    it('is the cycle in progress', () => {
      expect(rowWith([cycle({})])).toEqual({
        sessionsCounted: 2,
        sessionsPerCycle: 4,
        status: 'in_progress',
      });
    });

    it('prefers the cycle in progress over a Due one', () => {
      expect(
        rowWith([
          cycle({ status: 'due', cycleNumber: 1, sessionsCounted: 4 }),
          cycle({ status: 'in_progress', cycleNumber: 2, sessionsCounted: 1 }),
        ]),
      ).toMatchObject({ status: 'in_progress', sessionsCounted: 1 });
    });

    it('is the latest Due cycle when none is in progress', () => {
      expect(
        rowWith([
          cycle({ status: 'due', cycleNumber: 1, sessionsCounted: 4 }),
          cycle({ status: 'due', cycleNumber: 3, sessionsCounted: 4, sessionsPerCycle: 8 }),
          cycle({ status: 'due', cycleNumber: 2, sessionsCounted: 4 }),
        ]),
      ).toEqual({ sessionsCounted: 4, sessionsPerCycle: 8, status: 'due' });
    });

    it('is null with no cycle', () => {
      expect(rowWith([])).toBeNull();
    });
  });
});
