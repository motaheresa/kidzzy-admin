import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ErrorCode } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { uniqueViolationIndex } from '../prisma/prisma-errors';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { dateToString, stringToDate } from '../sessions/dates';
import { TenantContext } from '../tenancy/tenant-context';

const ENROLLMENT_SELECT = {
  id: true,
  studentId: true,
  startDate: true,
  endDate: true,
  student: { select: { name: true, code: true } },
  group: { select: { id: true, name: true } },
} as const satisfies Prisma.EnrollmentSelect;

/** An enrollment with its student's name and its group, as the mapper needs it. */
export type EnrollmentRow = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_SELECT }>;

/**
 * Reads and writes enrollments (US-08). An enrollment covers start_date to end_date, both
 * included; end_date null is the open one, at most one per student (a partial unique index).
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class EnrollmentRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** The group's open enrollments (its students now), by student name. */
  listOpenForGroup(groupId: string): Promise<EnrollmentRow[]> {
    return this.txHost.tx.enrollment.findMany({
      where: { groupId, endDate: null },
      select: ENROLLMENT_SELECT,
      orderBy: [{ student: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  /**
   * The students of a group on one academy-local day (YYYY-MM-DD): enrollments with
   * start_date <= day and end_date null or >= day, by student name. A student who moved on
   * that day belongs to the group they were in, because a day never has two enrollments.
   */
  listForGroupOnDate(groupId: string, day: string): Promise<EnrollmentRow[]> {
    const date = stringToDate(day);
    return this.txHost.tx.enrollment.findMany({
      where: {
        groupId,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      select: ENROLLMENT_SELECT,
      orderBy: [{ student: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  /**
   * The group's enrollments that overlap the days fromDay..toDay (YYYY-MM-DD, both included),
   * by student name. The attendance grid asks for the students of the sessions in that range.
   */
  listForGroupBetween(groupId: string, fromDay: string, toDay: string): Promise<EnrollmentRow[]> {
    return this.txHost.tx.enrollment.findMany({
      where: {
        groupId,
        startDate: { lte: stringToDate(toDay) },
        OR: [{ endDate: null }, { endDate: { gte: stringToDate(fromDay) } }],
      },
      select: ENROLLMENT_SELECT,
      orderBy: [{ student: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  /** All of the student's enrollments, the latest first (their group history). */
  listForStudent(studentId: string): Promise<EnrollmentRow[]> {
    return this.txHost.tx.enrollment.findMany({
      where: { studentId },
      select: ENROLLMENT_SELECT,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Sets the last day of the student's open enrollment. Call it before opening the next one. */
  async closeOpen(studentId: string, endDate: string): Promise<void> {
    await this.txHost.tx.enrollment.updateMany({
      where: { studentId, endDate: null },
      data: { endDate: stringToDate(endDate) },
    });
  }

  /** The last day of the student's latest closed enrollment (YYYY-MM-DD), or null. */
  async findLastEndDate(studentId: string): Promise<string | null> {
    const last = await this.txHost.tx.enrollment.findFirst({
      where: { studentId, endDate: { not: null } },
      orderBy: { endDate: 'desc' },
      select: { endDate: true },
    });
    return last?.endDate ? dateToString(last.endDate) : null;
  }

  /**
   * Opens an enrollment. A second open enrollment for the student breaks the partial unique index
   * enrollments_student_open_key: 409 STUDENT_ALREADY_ENROLLED, even when two requests race.
   */
  async create(input: {
    studentId: string;
    groupId: string;
    startDate: string;
  }): Promise<EnrollmentRow> {
    try {
      return await this.txHost.tx.enrollment.create({
        data: {
          academyId: this.tenant.requireAcademyId(),
          studentId: input.studentId,
          groupId: input.groupId,
          startDate: stringToDate(input.startDate),
        },
        select: ENROLLMENT_SELECT,
      });
    } catch (error) {
      if (uniqueViolationIndex(error) !== 'enrollments_student_open_key') throw error;
      throw alreadyEnrolled();
    }
  }
}

export function alreadyEnrolled(): AppException {
  return new AppException(
    ErrorCode.StudentAlreadyEnrolled,
    HttpStatus.CONFLICT,
    'The student is already in a group',
  );
}
