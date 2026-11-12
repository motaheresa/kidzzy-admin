import {
  buildInstructorStats,
  type InstructorSession,
  type InstructorStatsInput,
  type StatInstructor,
} from './instructor-stats';

const ana: StatInstructor = { id: 'ana', name: 'Ana', isActive: true };
const omar: StatInstructor = { id: 'omar', name: 'Omar', isActive: true };
const retired: StatInstructor = { id: 'zed', name: 'Zed', isActive: false };

let counter = 0;
function held(
  instructorId: string,
  minutes: number | null = 60,
  status: InstructorSession['status'] = 'held',
): InstructorSession {
  counter += 1;
  const start = new Date('2026-11-03T15:00:00.000Z');
  return {
    id: `s${counter}`,
    instructorId,
    status,
    actualStartedAt: minutes === null ? null : start,
    actualEndedAt: minutes === null ? null : new Date(start.getTime() + minutes * 60_000),
  };
}

function stats(overrides: Partial<InstructorStatsInput> = {}) {
  return buildInstructorStats({
    instructors: [ana, omar],
    sessions: [],
    attendance: new Map(),
    payments: [],
    dueCycles: [],
    passedDue: [],
    completions: [],
    activeGroups: [],
    ...overrides,
  });
}

const row = (result: ReturnType<typeof stats>, id: string) =>
  result.rows.find((r) => r.instructorId === id);

describe('buildInstructorStats', () => {
  describe('sessions', () => {
    it('counts held and cancelled sessions by the instructor on the session', () => {
      const result = stats({
        sessions: [held('ana'), held('ana'), held('ana', null, 'cancelled'), held('omar')],
      });
      expect(row(result, 'ana')).toMatchObject({ held: 2, cancelled: 1 });
      expect(row(result, 'omar')).toMatchObject({ held: 1, cancelled: 0 });
    });

    it('lets a former instructor keep what they taught, while the group current one does not get it', () => {
      // Omar teaches g1 now (activeGroups), but Ana held the session before the change.
      const result = stats({
        sessions: [held('ana', 90), held('ana', null)],
        activeGroups: [{ instructorId: 'omar' }],
      });
      expect(row(result, 'ana')).toMatchObject({
        held: 2,
        actualMinutes: 90,
        heldWithoutActualTimes: 1,
        activeGroups: 0,
      });
      expect(row(result, 'omar')).toMatchObject({
        held: 0,
        actualMinutes: 0,
        heldWithoutActualTimes: 0,
        activeGroups: 1,
      });
    });

    it('sums real minutes once and never falls back to the planned length', () => {
      const result = stats({
        sessions: [
          held('ana', 60),
          held('ana', 45),
          held('ana', null),
          held('ana', 30, 'cancelled'),
        ],
      });
      expect(row(result, 'ana')).toMatchObject({
        actualMinutes: 105,
        heldWithoutActualTimes: 1,
      });
    });

    it('counts the active groups an instructor teaches now', () => {
      const result = stats({
        activeGroups: [{ instructorId: 'ana' }, { instructorId: 'ana' }, { instructorId: 'omar' }],
      });
      expect(row(result, 'ana')?.activeGroups).toBe(2);
      expect(row(result, 'omar')?.activeGroups).toBe(1);
    });
  });

  describe('attendance rate', () => {
    it('is present over all attendance rows of their held sessions, one decimal', () => {
      const first = held('ana');
      const second = held('ana');
      const result = stats({
        sessions: [first, second],
        attendance: new Map([
          [first.id, { present: 2, total: 3 }],
          [second.id, { present: 3, total: 3 }],
        ]),
      });
      expect(row(result, 'ana')?.attendanceRate).toBe(83.3); // 5 of 6
    });

    it('is null when there are no attendance rows, and does not count cancelled sessions', () => {
      const cancelled = held('ana', null, 'cancelled');
      const result = stats({
        sessions: [held('ana'), cancelled],
        attendance: new Map([[cancelled.id, { present: 1, total: 1 }]]),
      });
      expect(row(result, 'ana')?.attendanceRate).toBeNull();
      expect(row(result, 'omar')?.attendanceRate).toBeNull();
    });
  });

  describe('money', () => {
    it('sums what was paid to each instructor as a decimal string', () => {
      const result = stats({
        payments: [
          { instructorId: 'ana', amount: '1500.00' },
          { instructorId: 'ana', amount: '0.10' },
          { instructorId: 'ana', amount: '0.20' },
          { instructorId: 'omar', amount: '800.50' },
        ],
      });
      expect(row(result, 'ana')?.paid).toBe('1500.30'); // never 0.30000000000000004
      expect(row(result, 'omar')?.paid).toBe('800.50');
      expect(result.kpis.paid).toBe('2300.80');
    });

    it('counts and totals the cycles due now, per instructor', () => {
      const result = stats({
        dueCycles: [
          { instructorId: 'ana', amount: '1500.00' },
          { instructorId: 'ana', amount: '1200.00' },
        ],
      });
      expect(row(result, 'ana')?.due).toEqual({ count: 2, total: '2700.00' });
      expect(row(result, 'omar')?.due).toEqual({ count: 0, total: '0.00' });
      expect(result.kpis.due).toEqual({ count: 2, total: '2700.00' });
    });

    it('adds the passed part and the projected part of two groups into one expected figure', () => {
      const result = stats({
        passedDue: [{ instructorId: 'ana', amount: '1500.00' }],
        completions: [
          { kind: 'instructor', payeeId: 'ana', amount: '1500.00' }, // group g1
          { kind: 'instructor', payeeId: 'ana', amount: '1200.00' }, // group g2
          { kind: 'instructor', payeeId: 'omar', amount: '800.00' },
          { kind: 'student', payeeId: 'ana', amount: '999.00' }, // a student with the same id: not theirs
        ],
      });
      expect(row(result, 'ana')?.expected).toBe('4200.00');
      expect(row(result, 'omar')?.expected).toBe('800.00');
      expect(result.kpis.expectedOutflow).toBe('5000.00');
    });
  });

  describe('which instructors are listed', () => {
    it('lists every active instructor, even with nothing to show', () => {
      const result = stats();
      expect(result.rows.map((r) => r.instructorId)).toEqual(['ana', 'omar']);
    });

    it('lists an inactive instructor who held a session, cancelled one or was paid', () => {
      for (const input of [
        { sessions: [held('zed')] },
        { sessions: [held('zed', null, 'cancelled')] },
        { payments: [{ instructorId: 'zed', amount: '100.00' }] },
      ]) {
        const result = stats({ instructors: [ana, retired], ...input });
        expect(row(result, 'zed')).toMatchObject({ isActive: false });
      }
    });

    it('lists an inactive instructor who is owed a cycle Due now, and counts it in kpis.due', () => {
      const result = stats({
        instructors: [ana, retired],
        dueCycles: [{ instructorId: 'zed', amount: '1500.00' }],
      });
      expect(row(result, 'zed')).toMatchObject({
        isActive: false,
        held: 0,
        due: { count: 1, total: '1500.00' },
      });
      expect(result.kpis.due).toEqual({ count: 1, total: '1500.00' });
      expect(result.kpis.activeInstructors).toBe(1);
    });

    it('lists an inactive instructor whose cycle fell due in the period, and counts it as expected', () => {
      const result = stats({
        instructors: [ana, retired],
        passedDue: [{ instructorId: 'zed', amount: '900.00' }],
      });
      expect(row(result, 'zed')?.expected).toBe('900.00');
      expect(result.kpis.expectedOutflow).toBe('900.00');
    });

    it('lists an inactive instructor with only a projected completion, and counts it as expected', () => {
      const result = stats({
        instructors: [ana, retired],
        completions: [{ kind: 'instructor', payeeId: 'zed', amount: '1200.00' }],
      });
      expect(row(result, 'zed')).toMatchObject({ isActive: false, expected: '1200.00' });
      expect(result.kpis.expectedOutflow).toBe('1200.00');
    });

    it('does not list an inactive instructor for a student who has the same id', () => {
      const result = stats({
        instructors: [ana, retired],
        completions: [{ kind: 'student', payeeId: 'zed', amount: '900.00' }],
      });
      expect(row(result, 'zed')).toBeUndefined();
    });

    it('leaves out an inactive instructor with nothing in the period and nothing owed', () => {
      const result = stats({
        instructors: [ana, retired],
        dueCycles: [{ instructorId: 'someone-else', amount: '100.00' }],
      });
      expect(result.rows.map((r) => r.instructorId)).toEqual(['ana']);
    });

    it('keeps the totals equal to the money of every listed instructor, former ones included', () => {
      const result = stats({
        instructors: [ana, retired],
        dueCycles: [
          { instructorId: 'ana', amount: '1500.00' },
          { instructorId: 'zed', amount: '1000.00' },
        ],
        passedDue: [{ instructorId: 'zed', amount: '1000.00' }],
        completions: [{ kind: 'instructor', payeeId: 'ana', amount: '1500.00' }],
      });
      expect(result.kpis.due).toEqual({ count: 2, total: '2500.00' });
      expect(result.kpis.expectedOutflow).toBe('2500.00');
    });

    it('ignores a session of someone who is not an instructor', () => {
      const result = stats({ sessions: [held('admin-1')] });
      expect(result.kpis.held).toBe(0);
    });

    it('orders the rows by name', () => {
      const result = stats({ instructors: [omar, ana] });
      expect(result.rows.map((r) => r.name)).toEqual(['Ana', 'Omar']);
    });
  });

  describe('the totals', () => {
    it('add up the rows, and count only the active instructors', () => {
      const result = stats({
        instructors: [ana, omar, retired],
        sessions: [held('ana', 60), held('omar', 30), held('zed', 15)],
      });
      expect(result.kpis).toMatchObject({
        activeInstructors: 2,
        held: 3,
        actualMinutes: 105,
      });
    });

    it('are zero for no instructors at all', () => {
      expect(stats({ instructors: [] }).kpis).toEqual({
        activeInstructors: 0,
        held: 0,
        actualMinutes: 0,
        paid: '0.00',
        due: { count: 0, total: '0.00' },
        expectedOutflow: '0.00',
      });
    });
  });
});
