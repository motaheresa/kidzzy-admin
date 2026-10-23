import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { CycleChange } from '@kidzzy/shared';
import { AcademyRepository } from '../academies/academy.repository';
import { EnrollmentRepository } from '../enrollments/enrollment.repository';
import { PaymentCycleRepository, type CountableCycle } from '../payments/payment-cycle.repository';
import { PaymentPlanRepository } from '../payments/payment-plan.repository';
import { SessionHeldHooks, type SessionHeldHook } from '../sessions/session-held-hooks';
import type { SessionRow } from '../sessions/session.repository';

/** How many times the open cycles are read again after a wait on a lock. */
const MAX_LOCK_ROUNDS = 5;

/**
 * Counting a Held session into payment cycles (US-22, BR-06 to BR-08). It runs inside the Held
 * transaction, after the group row is locked.
 *
 * The session counts once in the open cycle of every student whose enrollment covers its
 * academy-local date and of the instructor on the session. Attendance is never read (AC-02): an
 * absent student's cycle counts it too. When a counter reaches N the cycle becomes Due and the
 * next one opens at 0 under the plan version in effect for it (BR-10).
 *
 * A student's or an instructor's cycle is shared by every group they are in, so the group lock is
 * not enough: two sessions of different groups can touch the same cycle. Every cycle the session
 * touches is locked first, in one statement and in id order (no deadlock between two sessions that
 * share two payees), and the counters are read after the lock.
 */
@Injectable()
export class CycleCountingService implements SessionHeldHook, OnModuleInit {
  private readonly logger = new Logger(CycleCountingService.name);

  constructor(
    private readonly hooks: SessionHeldHooks,
    private readonly enrollments: EnrollmentRepository,
    private readonly cycles: PaymentCycleRepository,
    private readonly plans: PaymentPlanRepository,
    private readonly academies: AcademyRepository,
  ) {}

  onModuleInit(): void {
    this.hooks.register(this);
  }

  async onHeld(session: SessionRow, at: Date): Promise<CycleChange[]> {
    const zone = await this.academies.findTimezone();
    const day = DateTime.fromJSDate(session.scheduledAt, { zone }).toISODate();
    if (!day) throw new Error('The session time has no local date');
    const roster = await this.enrollments.listForGroupOnDate(session.group.id, day);
    const studentIds = [...new Set(roster.map((enrollment) => enrollment.studentId))];

    const locked = await this.lockOpenCycles(studentIds, session.instructorId);
    const counted = await this.cycles.findCountable(locked);
    this.warnAboutPayeesWithoutCycle(session, studentIds, counted);

    const changes: CycleChange[] = [];
    for (const cycle of counted) changes.push(await this.count(cycle, session, at));
    return changes;
  }

  /**
   * The ids of the open cycles of the payees, locked. If a lock wait ends with a cycle that a
   * concurrent session completed meanwhile, that cycle is not returned and the next one (opened
   * by that session) is found by reading again.
   */
  private async lockOpenCycles(studentIds: string[], instructorId: string): Promise<string[]> {
    const locked = new Set<string>();
    for (let round = 0; round < MAX_LOCK_ROUNDS; round += 1) {
      const pending = (await this.cycles.findOpenIds(studentIds, instructorId))
        .filter((id) => !locked.has(id))
        .sort();
      if (pending.length === 0) return [...locked];
      for (const id of await this.cycles.lockOpen(pending)) locked.add(id);
    }
    throw new Error('The open cycles kept changing while they were locked');
  }

  /** A payee with no open cycle is skipped: marking the session Held is never blocked by it. */
  private warnAboutPayeesWithoutCycle(
    session: SessionRow,
    studentIds: string[],
    counted: CountableCycle[],
  ): void {
    const withCycle = new Set(counted.flatMap((cycle) => [cycle.studentId, cycle.instructorId]));
    const missing = [
      ...studentIds.filter((id) => !withCycle.has(id)).map((id) => ['student', id]),
      ...(withCycle.has(session.instructorId) ? [] : [['instructor', session.instructorId]]),
    ];
    for (const [type, id] of missing) {
      this.logger.warn(
        'No open cycle for ' +
          type +
          ' ' +
          id +
          ': session ' +
          session.id +
          ' is not counted for them',
      );
    }
  }

  private async count(cycle: CountableCycle, session: SessionRow, at: Date): Promise<CycleChange> {
    const sessionsCounted = cycle.sessionsCounted + 1;
    const completes = sessionsCounted >= cycle.sessionsPerCycle;
    await this.cycles.addSession(cycle.id, session.id);
    await this.cycles.setCount(cycle.id, sessionsCounted, completes ? at : null);
    if (completes) await this.openNext(cycle);
    return {
      cycleId: cycle.id,
      payeeType: cycle.payeeType,
      studentId: cycle.studentId,
      instructorId: cycle.instructorId,
      sessionsCounted,
      sessionsPerCycle: cycle.sessionsPerCycle,
      status: completes ? 'due' : 'in_progress',
    };
  }

  private async openNext(cycle: CountableCycle): Promise<void> {
    const payee = cycle.studentId
      ? { studentId: cycle.studentId }
      : { instructorId: cycle.instructorId ?? '' };
    const plan = await this.plans.findInEffectForCycle(payee, cycle.cycleNumber + 1);
    if (!plan) throw new Error('A payee with a cycle has no plan version for the next one');
    await this.cycles.createNext(cycle, plan);
  }
}
