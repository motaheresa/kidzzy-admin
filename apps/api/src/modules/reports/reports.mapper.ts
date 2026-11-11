import type { OutstandingTotal } from '@kidzzy/shared';
import { subtractMoney, sumMoney, toMoney } from '../prisma/money';
import type { ProjectedPayee, ProjectionGroup, FutureSession } from './finance-projection';
import type {
  CycleAmountRow,
  FutureSessionRow,
  GroupReportRow,
  InstructorCycleRow,
  InstructorPlanRow,
  StudentReportRow,
} from './reports.repository';

/** The sum of the amounts of one payee type, as a decimal string. */
export function totalOf(
  rows: readonly CycleAmountRow[],
  payeeType: 'student' | 'instructor',
): string {
  return sumMoney(
    rows.filter((row) => row.payeeType === payeeType).map((row) => toMoney(row.amount)),
  );
}

/** How many cycles of one payee type, and what they add up to. */
export function toOutstanding(
  rows: readonly CycleAmountRow[],
  payeeType: 'student' | 'instructor',
): OutstandingTotal {
  return {
    count: rows.filter((row) => row.payeeType === payeeType).length,
    total: totalOf(rows, payeeType),
  };
}

/** Money in, money out and the difference. */
export function toFlow(
  moneyIn: string,
  moneyOut: string,
): { in: string; out: string; net: string } {
  return { in: moneyIn, out: moneyOut, net: subtractMoney(moneyIn, moneyOut) };
}

/** A student as the projection takes it: their open enrollment's group, cycle in progress, latest plan. */
export function toProjectedStudent(row: StudentReportRow): ProjectedPayee {
  const cycle = row.cycles[0];
  const plan = row.plans[0];
  return {
    kind: 'student',
    groupId: row.enrollments[0]?.groupId ?? null,
    instructorId: null,
    open: cycle
      ? {
          sessionsPerCycle: cycle.sessionsPerCycle,
          sessionsCounted: cycle.sessionsCounted,
          amount: toMoney(cycle.plan.amount),
        }
      : null,
    next: plan ? { sessionsPerCycle: plan.sessionsPerCycle, amount: toMoney(plan.amount) } : null,
  };
}

const pairKey = (instructorId: string, groupId: string) => `${instructorId}|${groupId}`;

/**
 * The (instructor, group) pairs: the current instructor of every active group, and any pair with a
 * cycle in progress (a former instructor keeps theirs, ADR-0015). Each with its cycle and its latest plan.
 */
export function toProjectedPairs(
  groups: readonly GroupReportRow[],
  cycles: readonly InstructorCycleRow[],
  plans: readonly InstructorPlanRow[],
): ProjectedPayee[] {
  const keys = new Map<string, { instructorId: string; groupId: string }>();
  for (const group of groups) {
    keys.set(pairKey(group.instructorId, group.id), {
      instructorId: group.instructorId,
      groupId: group.id,
    });
  }
  for (const cycle of cycles) {
    keys.set(pairKey(cycle.instructorId, cycle.groupId), {
      instructorId: cycle.instructorId,
      groupId: cycle.groupId,
    });
  }
  const cycleOf = new Map(
    cycles.map((cycle) => [pairKey(cycle.instructorId, cycle.groupId), cycle]),
  );
  const planOf = new Map(plans.map((plan) => [pairKey(plan.instructorId, plan.groupId), plan]));

  return [...keys.entries()].map(([key, pair]) => {
    const cycle = cycleOf.get(key);
    const plan = planOf.get(key);
    return {
      kind: 'instructor' as const,
      groupId: pair.groupId,
      instructorId: pair.instructorId,
      open: cycle
        ? {
            sessionsPerCycle: cycle.sessionsPerCycle,
            sessionsCounted: cycle.sessionsCounted,
            amount: toMoney(cycle.amount),
          }
        : null,
      next: plan ? { sessionsPerCycle: plan.sessionsPerCycle, amount: toMoney(plan.amount) } : null,
    };
  });
}

/** The groups the projection extends with their slots. A slot's time is stored as a TIME column. */
export function toProjectionGroups(groups: readonly GroupReportRow[]): ProjectionGroup[] {
  return groups.map((group) => ({
    id: group.id,
    instructorId: group.instructorId,
    slots: group.slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startTime: slot.startTime.toISOString().slice(11, 16),
      durationMin: slot.durationMin,
    })),
  }));
}

export function toFutureSessions(rows: readonly FutureSessionRow[]): FutureSession[] {
  return rows.map((row) => ({
    groupId: row.groupId,
    instructorId: row.instructorId,
    at: row.scheduledAt,
  }));
}
