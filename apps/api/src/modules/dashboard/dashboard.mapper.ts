import type { DashboardDueCycle, DashboardHeldSession } from '@kidzzy/shared';
import type { PaymentCycleRow } from '../payments/payment-cycle.repository';
import { toMoney } from '../prisma/money';
import { actualDurationMin } from '../sessions/session.mapper';
import type { AttendanceCount, HeldSessionRow } from './dashboard.repository';

/** openapi.yaml: DashboardHeldSession. Built field by field. */
export function toHeldSession(
  row: HeldSessionRow,
  attendance: AttendanceCount | undefined,
): DashboardHeldSession {
  return {
    sessionId: row.id,
    scheduledAt: row.scheduledAt.toISOString(),
    group: { id: row.group.id, name: row.group.name },
    instructor: { id: row.instructorId, name: row.instructor.name },
    topic: row.topic,
    attendance: attendance ?? { present: 0, enrolled: 0 },
    actualDurationMin: actualDurationMin(row),
  };
}

/** openapi.yaml: DashboardDueCycle. The group is only an instructor's (paid per group). */
export function toDueCycle(row: PaymentCycleRow): DashboardDueCycle {
  const isStudent = row.payeeType === 'student';
  return {
    id: row.id,
    payeeId: (isStudent ? row.studentId : row.instructorId) ?? '',
    payeeName: (isStudent ? row.student?.name : row.instructor?.name) ?? '',
    cycleNumber: row.cycleNumber,
    amount: toMoney(row.plan.amount),
    dueAt: row.dueAt?.toISOString() ?? null,
    group:
      !isStudent && row.groupId && row.group ? { id: row.groupId, name: row.group.name } : null,
  };
}
