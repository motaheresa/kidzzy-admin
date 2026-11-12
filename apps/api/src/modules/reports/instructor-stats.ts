import type { InstructorsReportKpis, InstructorsReportRow } from '@kidzzy/shared';
import { sumMoney } from '../prisma/money';

/** An instructor of the academy: a user holding the Instructor role. */
export interface StatInstructor {
  id: string;
  name: string;
  isActive: boolean;
}

/** A held or cancelled session of the period: the instructor on it is who taught (or was to teach) it. */
export interface InstructorSession {
  id: string;
  instructorId: string;
  status: 'held' | 'cancelled' | 'scheduled';
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}

/** An amount that belongs to an instructor: a payment, a Due cycle at its plan amount. */
export interface InstructorAmount {
  instructorId: string;
  amount: string;
}

export interface InstructorStatsInput {
  instructors: readonly StatInstructor[];
  sessions: readonly InstructorSession[];
  /** Attendance rows of the period's held sessions, by session id. */
  attendance: ReadonlyMap<string, { present: number; total: number }>;
  /** Payments on instructor cycles with paid_on in the period. */
  payments: readonly InstructorAmount[];
  /** Instructor cycles Due now, whatever the period. */
  dueCycles: readonly InstructorAmount[];
  /** Instructor cycles whose due_at fell in the part of the period that has passed (plan amount). */
  passedDue: readonly InstructorAmount[];
  /** What the finance projection says will complete in the part still ahead. */
  completions: readonly { kind: 'student' | 'instructor'; payeeId: string; amount: string }[];
  /** Active groups, to count how many each instructor teaches now. */
  activeGroups: readonly { instructorId: string }[];
}

export interface InstructorStats {
  kpis: InstructorsReportKpis;
  rows: InstructorsReportRow[];
}

/**
 * The rows and totals of the instructors report, as a pure function: the repository loads, this
 * decides. No query, no clock, no time zone inside; money stays a decimal string (the string
 * helpers of prisma/money, never a JS number).
 *
 * A session counts for the instructor on the session, not the group's current one, so a former
 * instructor keeps what they taught. Real time is only what the actual start and end say: a held
 * session without them is counted apart, and the planned length never stands in for it.
 *
 * Rows: every active instructor, plus an inactive one who held or cancelled a session, or was paid,
 * in the period. An inactive instructor with nothing to show is left out. Ordered by name.
 */
export function buildInstructorStats(input: InstructorStatsInput): InstructorStats {
  const rows: InstructorsReportRow[] = [];
  for (const instructor of input.instructors) {
    const mine = input.sessions.filter((session) => session.instructorId === instructor.id);
    const held = mine.filter((session) => session.status === 'held');
    const cancelled = mine.filter((session) => session.status === 'cancelled');
    const payments = input.payments.filter((payment) => payment.instructorId === instructor.id);

    if (!instructor.isActive && held.length + cancelled.length + payments.length === 0) continue;

    const due = input.dueCycles.filter((cycle) => cycle.instructorId === instructor.id);
    const expected = [
      ...input.passedDue.filter((cycle) => cycle.instructorId === instructor.id),
      ...input.completions.filter(
        (completion) => completion.kind === 'instructor' && completion.payeeId === instructor.id,
      ),
    ];
    const withTimes = held.filter((session) => session.actualStartedAt && session.actualEndedAt);
    const milliseconds = withTimes.reduce(
      (total, session) =>
        total + (session.actualEndedAt!.getTime() - session.actualStartedAt!.getTime()),
      0,
    );

    let present = 0;
    let total = 0;
    for (const session of held) {
      const counts = input.attendance.get(session.id);
      if (counts) {
        present += counts.present;
        total += counts.total;
      }
    }

    rows.push({
      instructorId: instructor.id,
      name: instructor.name,
      isActive: instructor.isActive,
      activeGroups: input.activeGroups.filter((group) => group.instructorId === instructor.id)
        .length,
      held: held.length,
      cancelled: cancelled.length,
      actualMinutes: Math.round(milliseconds / 60_000),
      heldWithoutActualTimes: held.length - withTimes.length,
      attendanceRate: total === 0 ? null : Math.round((present * 1000) / total) / 10,
      paid: sumMoney(payments.map((payment) => payment.amount)),
      due: { count: due.length, total: sumMoney(due.map((cycle) => cycle.amount)) },
      expected: sumMoney(expected.map((item) => item.amount)),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.instructorId.localeCompare(b.instructorId));

  const dueRows = rows.flatMap((row) => (row.due.count > 0 ? [row.due] : []));
  return {
    kpis: {
      activeInstructors: rows.filter((row) => row.isActive).length,
      held: rows.reduce((sum, row) => sum + row.held, 0),
      actualMinutes: rows.reduce((sum, row) => sum + row.actualMinutes, 0),
      paid: sumMoney(rows.map((row) => row.paid)),
      due: {
        count: dueRows.reduce((sum, due) => sum + due.count, 0),
        total: sumMoney(dueRows.map((due) => due.total)),
      },
      expectedOutflow: sumMoney(rows.map((row) => row.expected)),
    },
    rows,
  };
}
