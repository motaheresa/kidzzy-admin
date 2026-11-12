import { occurrenceInstant } from '../sessions/occurrences';
import {
  projectCompletions,
  type FutureSession,
  type ProjectedPayee,
  type ProjectionInput,
} from './finance-projection';

const ZONE = 'Africa/Cairo';
const at = (day: string, time = '17:00') => occurrenceInstant(day, time, ZONE);

// "Now" is 2026-11-12 10:00 in Cairo. The generator covered through 2026-12-09 (4 weeks).
const NOW = at('2026-11-12', '10:00');
const HORIZON = '2026-12-09';

/** The period from the start of `from` to the end of `to`, both local days. */
const period = (from: string, to: string) => ({
  start: at(from, '00:00'),
  end: at(nextDay(to), '00:00'),
});
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const sessionsOn = (groupId: string, instructorId: string, days: string[]): FutureSession[] =>
  days.map((day) => ({ groupId, instructorId, at: at(day) }));

const student = (overrides: Partial<ProjectedPayee> = {}): ProjectedPayee => ({
  kind: 'student',
  payeeId: 'st1',
  groupId: 'g1',
  instructorId: null,
  open: { sessionsPerCycle: 4, sessionsCounted: 2, amount: '900.00' },
  next: { sessionsPerCycle: 4, amount: '900.00' },
  ...overrides,
});

const pair = (overrides: Partial<ProjectedPayee> = {}): ProjectedPayee => ({
  kind: 'instructor',
  payeeId: overrides.instructorId ?? 'ana',
  groupId: 'g1',
  instructorId: 'ana',
  open: { sessionsPerCycle: 4, sessionsCounted: 2, amount: '1500.00' },
  next: { sessionsPerCycle: 4, amount: '1500.00' },
  ...overrides,
});

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    ...period('2026-11-01', '2026-11-30'),
    now: NOW,
    zone: ZONE,
    horizon: HORIZON,
    payees: [],
    sessions: [],
    groups: [],
    ...overrides,
  };
}

const amounts = (result: ReturnType<typeof projectCompletions>) =>
  result.completions.map((completion) => completion.amount);

describe('projectCompletions', () => {
  it('counts a cycle that completes inside the period, at the amount of its plan', () => {
    // Two more sessions complete the cycle (2 of 4 counted): the second one is on the 19th.
    const result = projectCompletions(
      input({
        payees: [student()],
        sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19', '2026-11-26']),
      }),
    );
    expect(result.completions).toEqual([
      { kind: 'student', payeeId: 'st1', amount: '900.00', at: at('2026-11-19') },
    ]);
  });

  it('does not count a cycle that completes after the period', () => {
    // Needs three more sessions; the third is on 2026-12-03, after the period ends on the 30th.
    const result = projectCompletions(
      input({
        payees: [student({ open: { sessionsPerCycle: 4, sessionsCounted: 1, amount: '900.00' } })],
        sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-26', '2026-12-03']),
      }),
    );
    expect(result.completions).toEqual([]);
  });

  it('shifts the completion later when a session is missing, as a Cancelled one is (it is not in the input)', () => {
    const planned = ['2026-11-13', '2026-11-19', '2026-11-26'];
    const withAll = projectCompletions(
      input({ payees: [student()], sessions: sessionsOn('g1', 'ana', planned) }),
    );
    // The 19th was cancelled: the cycle now completes on the 26th instead.
    const withoutOne = projectCompletions(
      input({
        payees: [student()],
        sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-26']),
      }),
    );
    expect(withAll.completions[0]?.at).toEqual(at('2026-11-19'));
    expect(withoutOne.completions[0]?.at).toEqual(at('2026-11-26'));
  });

  it('counts two cycles in a long period, the second at the latest plan (applied from the next cycle)', () => {
    // 1 more session completes the first cycle (900), then the new plan: 2 sessions, 1200.
    const result = projectCompletions(
      input({
        payees: [
          student({
            open: { sessionsPerCycle: 4, sessionsCounted: 3, amount: '900.00' },
            next: { sessionsPerCycle: 2, amount: '1200.00' },
          }),
        ],
        sessions: sessionsOn('g1', 'ana', [
          '2026-11-13',
          '2026-11-19',
          '2026-11-20',
          '2026-11-26',
          '2026-11-27',
        ]),
      }),
    );
    expect(amounts(result)).toEqual(['900.00', '1200.00', '1200.00']);
    expect(result.completions.map((completion) => completion.at)).toEqual([
      at('2026-11-13'),
      at('2026-11-20'),
      at('2026-11-27'),
    ]);
  });

  it('advances past a cycle that completes before a period in the future, without counting it', () => {
    // The period starts on the 25th. The first cycle completes on the 19th (before it, not counted);
    // the next one needs 4 sessions and completes on the 29th, inside.
    const result = projectCompletions(
      input({
        ...period('2026-11-25', '2026-11-30'),
        payees: [student()],
        sessions: sessionsOn('g1', 'ana', [
          '2026-11-13',
          '2026-11-19',
          '2026-11-20',
          '2026-11-22',
          '2026-11-26',
          '2026-11-29',
        ]),
      }),
    );
    expect(result.completions).toEqual([
      { kind: 'student', payeeId: 'st1', amount: '900.00', at: at('2026-11-29') },
    ]);
  });

  it('only looks ahead of now when the period began in the past', () => {
    // The part before now is read from due_at elsewhere: a session before now is not in the input,
    // and a completion at now or later counts.
    const result = projectCompletions(
      input({
        ...period('2026-11-01', '2026-11-30'),
        payees: [student({ open: { sessionsPerCycle: 4, sessionsCounted: 3, amount: '900.00' } })],
        sessions: sessionsOn('g1', 'ana', ['2026-11-12']),
      }),
    );
    expect(result.completions).toHaveLength(1);
  });

  it('projects nothing, and skips nothing, for a period that has already ended', () => {
    const result = projectCompletions(
      input({
        ...period('2026-10-01', '2026-10-31'),
        payees: [student(), student({ groupId: null }), pair({ next: null })],
        sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19']),
      }),
    );
    expect(result).toEqual({ completions: [], skippedStudents: 0, skippedInstructorPairs: 0 });
  });

  it('only walks the sessions an instructor pair teaches, in its group', () => {
    const sessions = [
      ...sessionsOn('g1', 'omar', ['2026-11-13', '2026-11-14']), // another instructor, same group
      ...sessionsOn('g2', 'ana', ['2026-11-15', '2026-11-16']), // same instructor, another group
      ...sessionsOn('g1', 'ana', ['2026-11-19', '2026-11-26']),
    ];
    const result = projectCompletions(input({ payees: [pair()], sessions }));
    expect(result.completions).toEqual([
      { kind: 'instructor', payeeId: 'ana', amount: '1500.00', at: at('2026-11-26') },
    ]);
  });

  describe('beyond the generated sessions', () => {
    // g1 meets on Thursdays (weekday 4) at 17:00; sessions exist through the horizon (2026-12-09).
    const groups = [
      {
        id: 'g1',
        instructorId: 'ana',
        slots: [{ id: 's1', weekday: 4, startTime: '17:00', durationMin: 60 }],
      },
    ];
    const generated = sessionsOn('g1', 'ana', [
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
      '2026-12-03',
    ]);

    it('extends the group with its slots, week by week, so a far period still projects', () => {
      // The open cycle needs 2 more sessions and completes on the 19th, before the period starts
      // (not counted, it only advances the walk). The next cycle needs 4: the 26th and the 3rd
      // (generated), then the 10th and the 17th from the slot. It completes on the 17th, inside.
      const result = projectCompletions(
        input({
          ...period('2026-12-14', '2027-01-10'),
          payees: [
            student({ open: { sessionsPerCycle: 4, sessionsCounted: 2, amount: '900.00' } }),
          ],
          sessions: generated,
          groups,
        }),
      );
      expect(result.completions.map((completion) => completion.at)).toEqual([at('2026-12-17')]);
    });

    it('does not repeat a slot inside the horizon: the rows are the truth there', () => {
      // The 19th was cancelled (no row in the input) and nothing replaces it from the slot.
      const result = projectCompletions(
        input({
          payees: [
            student({ open: { sessionsPerCycle: 4, sessionsCounted: 2, amount: '900.00' } }),
          ],
          sessions: sessionsOn('g1', 'ana', ['2026-11-12', '2026-11-26', '2026-12-03']),
          groups,
        }),
      );
      // 12th, 26th complete the open cycle on the 26th (inside the period ending the 30th).
      expect(result.completions.map((completion) => completion.at)).toEqual([at('2026-11-26')]);
    });

    it('adds nothing for a group with no active slot', () => {
      const result = projectCompletions(
        input({
          ...period('2026-12-14', '2027-01-10'),
          payees: [student()],
          sessions: generated,
          groups: [{ id: 'g1', instructorId: 'ana', slots: [] }],
        }),
      );
      expect(result.completions).toEqual([]);
    });

    it('gives the extended sessions to the group’s current instructor only', () => {
      const former = projectCompletions(
        input({
          ...period('2026-12-14', '2027-01-10'),
          payees: [
            pair({
              instructorId: 'omar',
              open: { sessionsPerCycle: 2, sessionsCounted: 0, amount: '1500.00' },
            }),
          ],
          sessions: generated,
          groups,
        }),
      );
      expect(former.completions).toEqual([]);
      const current = projectCompletions(
        input({
          ...period('2026-12-14', '2027-01-10'),
          payees: [pair({ open: { sessionsPerCycle: 2, sessionsCounted: 0, amount: '1500.00' } })],
          sessions: generated,
          groups,
        }),
      );
      expect(current.completions.length).toBeGreaterThan(0);
    });
  });

  describe('payees that cannot be projected', () => {
    it('skips and counts a student with no open enrollment or no plan, and a pair with no plan', () => {
      const result = projectCompletions(
        input({
          payees: [
            student({ groupId: null }),
            student({ next: null }),
            student(),
            pair({ next: null }),
            pair({ next: null }),
          ],
          sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19']),
        }),
      );
      expect(result.skippedStudents).toBe(2);
      expect(result.skippedInstructorPairs).toBe(2);
      expect(result.completions).toHaveLength(1);
    });

    it('leaves out, without counting it as skipped, a payee with a plan but no cycle in progress', () => {
      const result = projectCompletions(
        input({
          payees: [student({ open: null }), pair({ open: null })],
          sessions: sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19']),
        }),
      );
      expect(result).toEqual({ completions: [], skippedStudents: 0, skippedInstructorPairs: 0 });
    });

    it('moves on to the next cycle when the open one has already counted all its sessions', () => {
      const result = projectCompletions(
        input({
          payees: [
            student({ open: { sessionsPerCycle: 4, sessionsCounted: 4, amount: '900.00' } }),
          ],
          sessions: sessionsOn('g1', 'ana', [
            '2026-11-13',
            '2026-11-14',
            '2026-11-15',
            '2026-11-16',
          ]),
        }),
      );
      expect(result.completions).toEqual([
        { kind: 'student', payeeId: 'st1', amount: '900.00', at: at('2026-11-16') },
      ]);
    });
  });

  describe('who a completion belongs to', () => {
    it('carries the payee id, so a report can group the cycles by person', () => {
      const result = projectCompletions(
        input({
          payees: [student(), pair()],
          sessions: [...sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19', '2026-11-26'])],
        }),
      );
      expect(result.completions.map((c) => [c.kind, c.payeeId])).toEqual([
        ['student', 'st1'],
        ['instructor', 'ana'],
      ]);
    });

    it('keeps two instructors, and two groups of one instructor, apart in one run', () => {
      const result = projectCompletions(
        input({
          payees: [
            pair({ instructorId: 'ana', groupId: 'g1' }),
            pair({ instructorId: 'ana', groupId: 'g2' }),
            pair({ instructorId: 'omar', groupId: 'g3' }),
          ],
          sessions: [
            ...sessionsOn('g1', 'ana', ['2026-11-13', '2026-11-19']),
            ...sessionsOn('g2', 'ana', ['2026-11-14', '2026-11-20']),
            ...sessionsOn('g3', 'omar', ['2026-11-15', '2026-11-21']),
          ],
        }),
      );
      const byPayee = new Map<string, number>();
      for (const c of result.completions) {
        byPayee.set(c.payeeId, (byPayee.get(c.payeeId) ?? 0) + 1);
      }
      expect(Object.fromEntries(byPayee)).toEqual({ ana: 2, omar: 1 });
    });
  });
});
