import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FinanceReport,
  InstructorsReport,
  OverviewReport,
  SessionsReport,
} from '@kidzzy/shared';
import { AcademyRepository } from '../academies/academy.repository';
import { subtractMoney, sumMoney, toMoney, toMoneyOrZero } from '../prisma/money';
import { Clock } from '../sessions/clock';
import { addDays, localDateOf } from '../sessions/occurrences';
import { projectCompletions } from './finance-projection';
import { resolvePeriod } from './report-period';
import {
  toFlow,
  toFutureSessions,
  toOutstanding,
  toProjectedPairs,
  toProjectedStudent,
  toProjectionGroups,
  totalOf,
} from './reports.mapper';
import { ReportsRepository } from './reports.repository';
import { buildInstructorStats } from './instructor-stats';
import { buildSessionStats } from './session-stats';

/**
 * The reports of the admin (US-38). Money is a decimal string end to end: Decimal sums in the
 * database and the helpers in prisma/money, never a JS number. "Today" and the period come from
 * the academy's zone and the injectable Clock.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly academies: AcademyRepository,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  /**
   * Actual: payments with paid_on in the period. Expected: the cycles that fell due in the part of
   * the period that has passed (read from their due_at, at their plan amount) plus the cycles that
   * will complete in the part still ahead (finance-projection.ts). Outstanding: every Due cycle
   * still unpaid, whatever the period.
   */
  async finance(query: { from?: string; to?: string }): Promise<FinanceReport> {
    const zone = await this.academies.findTimezone();
    const now = this.clock.now();
    const period = resolvePeriod(query, localDateOf(now, zone), zone);

    const passedEnd = period.end.getTime() < now.getTime() ? period.end : now;
    const [paidIn, paidOut, passed, outstanding] = await Promise.all([
      this.reports.sumPaidOn('student', period.from, period.to),
      this.reports.sumPaidOn('instructor', period.from, period.to),
      period.start.getTime() < passedEnd.getTime()
        ? this.reports.listCyclesDueBetween(period.start, passedEnd)
        : Promise.resolve([]),
      this.reports.listOutstandingCycles(),
    ]);

    const ahead = await this.projectAhead(period.start, period.end, now, zone);

    return {
      period: { from: period.from, to: period.to },
      actual: toFlow(toMoneyOrZero(paidIn), toMoneyOrZero(paidOut)),
      expected: {
        ...toFlow(
          sumMoney([totalOf(passed, 'student'), ahead.in]),
          sumMoney([totalOf(passed, 'instructor'), ahead.out]),
        ),
        skippedStudents: ahead.skippedStudents,
        skippedInstructorPairs: ahead.skippedInstructorPairs,
      },
      outstanding: {
        students: toOutstanding(outstanding, 'student'),
        instructors: toOutstanding(outstanding, 'instructor'),
      },
    };
  }

  /**
   * Session statistics of the period (US-39): the repository loads the period's sessions and the
   * attendance counts of its held ones, and the pure buildSessionStats decides the buckets and
   * KPIs. The same period rules as the finance report (ADR-0017).
   */
  async sessions(query: { from?: string; to?: string }): Promise<SessionsReport> {
    const zone = await this.academies.findTimezone();
    const now = this.clock.now();
    const period = resolvePeriod(query, localDateOf(now, zone), zone);

    const [sessions, attendance] = await Promise.all([
      this.reports.listSessionsBetween(period.start, period.end),
      this.reports.countAttendanceOfHeld(period.start, period.end),
    ]);
    const stats = buildSessionStats({
      sessions,
      attendance,
      period: { from: period.from, to: period.to },
      now,
      zone,
    });
    return { period: { from: period.from, to: period.to }, ...stats };
  }

  /**
   * The statistics of every instructor in the period (US-40). The rows are built by the pure
   * buildInstructorStats from what the repository loads. Expected is what finance shows for
   * instructors, split by person: the cycles that fell due in the passed part of the period, plus
   * the completions of the same projection that finance uses (projectAhead), grouped by payee.
   */
  async instructors(query: { from?: string; to?: string }): Promise<InstructorsReport> {
    const zone = await this.academies.findTimezone();
    const now = this.clock.now();
    const period = resolvePeriod(query, localDateOf(now, zone), zone);
    const passedEnd = period.end.getTime() < now.getTime() ? period.end : now;

    const [instructors, sessions, attendance, payments, outstanding, passed, groups] =
      await Promise.all([
        this.reports.listInstructors(),
        this.reports.listInstructorSessions(period.start, period.end),
        this.reports.countAttendanceBySession(period.start, period.end),
        this.reports.listInstructorPayments(period.from, period.to),
        this.reports.listOutstandingCycles(),
        period.start.getTime() < passedEnd.getTime()
          ? this.reports.listCyclesDueBetween(period.start, passedEnd)
          : Promise.resolve([]),
        this.reports.listActiveGroups(),
      ]);
    const ahead = await this.projectAhead(period.start, period.end, now, zone);

    const amounts = (rows: typeof outstanding) =>
      rows.flatMap((row) =>
        row.payeeType === 'instructor' && row.instructorId
          ? [{ instructorId: row.instructorId, amount: toMoney(row.amount) }]
          : [],
      );
    const stats = buildInstructorStats({
      instructors,
      sessions,
      attendance,
      payments: payments.map((payment) => ({
        instructorId: payment.instructorId,
        amount: toMoney(payment.amount),
      })),
      dueCycles: amounts(outstanding),
      passedDue: amounts(passed),
      completions: ahead.completions,
      activeGroups: groups,
    });
    return { period: { from: period.from, to: period.to }, ...stats };
  }

  /** The cycles that complete in [max(start, now), end): what the rows say, run through the pure projection. */
  private async projectAhead(start: Date, end: Date, now: Date, zone: string) {
    if (end.getTime() <= now.getTime()) {
      return {
        in: '0.00',
        out: '0.00',
        skippedStudents: 0,
        skippedInstructorPairs: 0,
        completions: [],
      };
    }
    const [students, groups, instructorCycles, instructorPlans, sessions] = await Promise.all([
      this.reports.listStudents(),
      this.reports.listActiveGroups(),
      this.reports.listInstructorCyclesInProgress(),
      this.reports.listLatestInstructorPlans(),
      this.reports.listFutureScheduledSessions(now, end),
    ]);
    const weeks = this.config.getOrThrow<number>('SESSION_GENERATION_WEEKS');
    const projection = projectCompletions({
      start,
      end,
      now,
      zone,
      horizon: addDays(localDateOf(now, zone), weeks * 7 - 1),
      payees: [
        ...students.map(toProjectedStudent),
        ...toProjectedPairs(groups, instructorCycles, instructorPlans),
      ],
      sessions: toFutureSessions(sessions),
      groups: toProjectionGroups(groups),
    });
    const amountsOf = (kind: 'student' | 'instructor') =>
      projection.completions.filter((completion) => completion.kind === kind).map((c) => c.amount);
    return {
      in: sumMoney(amountsOf('student')),
      out: sumMoney(amountsOf('instructor')),
      skippedStudents: projection.skippedStudents,
      skippedInstructorPairs: projection.skippedInstructorPairs,
      completions: projection.completions,
    };
  }

  /**
   * One full round, not filtered by a period: one cycle at the latest plan for every student with
   * an open enrollment and a plan (income) and for every (instructor, group) pair of an active
   * group whose instructor is the group's current one (outflow). The average round is, over those
   * students, their sessions per cycle divided by the active slots a week of their group.
   */
  async overview(): Promise<OverviewReport> {
    const [students, groups, plans] = await Promise.all([
      this.reports.listStudents(),
      this.reports.listActiveGroups(),
      this.reports.listLatestInstructorPlans(),
    ]);

    const enrolled = students.flatMap((student) => {
      const groupId = student.enrollments[0]?.groupId;
      const plan = student.plans[0];
      return groupId && plan ? [{ groupId, plan }] : [];
    });
    const roundIncome = sumMoney(enrolled.map(({ plan }) => toMoney(plan.amount)));

    const planOf = new Map(plans.map((plan) => [`${plan.instructorId}|${plan.groupId}`, plan]));
    const roundOutflow = sumMoney(
      groups.flatMap((group) => {
        const plan = planOf.get(`${group.instructorId}|${group.id}`);
        return plan ? [toMoney(plan.amount)] : [];
      }),
    );

    const slotsPerWeek = new Map(groups.map((group) => [group.id, group.slots.length]));
    const weeks = enrolled.flatMap(({ groupId, plan }) => {
      const slots = slotsPerWeek.get(groupId) ?? 0;
      return slots > 0 ? [plan.sessionsPerCycle / slots] : [];
    });
    const average =
      weeks.length === 0
        ? null
        : Math.round((weeks.reduce((a, b) => a + b, 0) / weeks.length) * 10) / 10;

    return {
      roundIncome,
      roundOutflow,
      roundNet: subtractMoney(roundIncome, roundOutflow),
      averageRoundWeeks: average,
    };
  }
}
