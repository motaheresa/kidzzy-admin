import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Enrollment } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AccessContext } from '../auth/access-context';
import { GroupRepository, type GroupRow } from '../groups/group.repository';
import { PaymentCycleRepository } from '../payments/payment-cycle.repository';
import { PaymentPlanRepository } from '../payments/payment-plan.repository';
import { toDecimal } from '../prisma/money';
import { StudentRepository } from '../students/student.repository';
import type { EnrollStudentDto } from './dto/enroll-student.dto';
import { alreadyEnrolled, EnrollmentRepository } from './enrollment.repository';
import { toEnrollment } from './enrollment.mapper';

/**
 * A student joins a group with a payment plan (US-08) and a starting point (US-36).
 *
 * The plan and the cycles belong to the student, not to the enrollment (BR-11). So:
 * - a student enrolled for the first time gets plan version 1 and cycle 1, which counts from the
 *   starting point (BR-14);
 * - a student who left and is enrolled again keeps their cycle in progress and its plan. A plan
 *   that differs from their latest version becomes the next version, from the next cycle (BR-10),
 *   and a starting point is refused (409 STARTING_POINT_LOCKED): it only applies to a first cycle.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly students: StudentRepository,
    private readonly groups: GroupRepository,
    private readonly plans: PaymentPlanRepository,
    private readonly cycles: PaymentCycleRepository,
    private readonly access: AccessContext,
  ) {}

  /** GET /groups/{id}/enrollments: the group's students now. Scope `own`: their groups only. */
  async listForGroup(groupId: string): Promise<Enrollment[]> {
    const group = await this.findGroupOrThrow(groupId);
    this.access.ensureOwner(this.access.scopeFor('groups.read'), group.instructor.id);
    return (await this.enrollments.listOpenForGroup(groupId)).map(toEnrollment);
  }

  /**
   * POST /groups/{id}/enrollments, in one transaction: the enrollment, and the plan version and
   * first cycle when they are needed. The student row is locked first, so two requests for the
   * same student (or an enrollment and a deactivation) run one after the other.
   */
  @Transactional()
  async enroll(groupId: string, dto: EnrollStudentDto): Promise<Enrollment> {
    const group = await this.findGroupOrThrow(groupId);
    if (!group.isActive) {
      throw new AppException(ErrorCode.GroupInactive, HttpStatus.CONFLICT, 'The group is inactive');
    }

    await this.students.lock(dto.studentId);
    const student = await this.students.findById(dto.studentId);
    if (!student?.isActive) {
      throw new AppException(
        ErrorCode.StudentNotEnrollable,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Not an active student of the academy',
      );
    }
    if (student.enrollments.length > 0) throw alreadyEnrolled();

    // A day never belongs to two enrollments: the new one starts after the last one ended.
    const lastEnd = await this.enrollments.findLastEndDate(student.id);
    if (lastEnd !== null && dto.startDate <= lastEnd) {
      throw new AppException(
        ErrorCode.EnrollmentDateInvalid,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The start date must be after the end of the previous enrollment',
      );
    }

    if (await this.cycles.studentHasCycles(student.id)) {
      await this.continuePlan(student.id, dto);
    } else {
      await this.startPlan(student.id, dto);
    }

    const enrollment = await this.enrollments.create({
      studentId: student.id,
      groupId,
      startDate: dto.startDate,
    });
    return toEnrollment(enrollment);
  }

  /** A first enrollment: plan version 1 and cycle 1 from the starting point (BR-14, AC-10). */
  private async startPlan(studentId: string, dto: EnrollStudentDto): Promise<void> {
    const openingCount = dto.openingCount ?? 0;
    if (openingCount >= dto.plan.sessionsPerCycle) {
      throw new AppException(
        ErrorCode.StartingPointOutOfRange,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The starting point must be less than the sessions per cycle',
      );
    }
    const plan = await this.plans.createForStudent({
      studentId,
      version: 1,
      sessionsPerCycle: dto.plan.sessionsPerCycle,
      amount: toDecimal(dto.plan.amount),
      effectiveFromCycle: 1,
    });
    await this.cycles.createFirstForStudent(studentId, plan, openingCount);
    // TODO(US-35): audit log, the student's plan was set (NFR-06).
  }

  /**
   * The student had cycles: the one in progress continues with its plan. A different plan is a
   * new version from the next cycle (BR-10); the same plan adds nothing.
   */
  private async continuePlan(studentId: string, dto: EnrollStudentDto): Promise<void> {
    if ((dto.openingCount ?? 0) !== 0) {
      throw new AppException(
        ErrorCode.StartingPointLocked,
        HttpStatus.CONFLICT,
        'The starting point only applies to a first cycle',
      );
    }
    const open = await this.cycles.findOpenForStudent(studentId);
    const latest = await this.plans.findLatestForStudent(studentId);
    if (!open || !latest) {
      // BR-08 always opens the next cycle, so a student with cycles has one in progress.
      throw new Error(`Student ${studentId} has cycles but no cycle in progress or no plan`);
    }
    const amount = toDecimal(dto.plan.amount);
    if (latest.sessionsPerCycle === dto.plan.sessionsPerCycle && latest.amount.equals(amount)) {
      return;
    }
    await this.plans.createForStudent({
      studentId,
      version: latest.version + 1,
      sessionsPerCycle: dto.plan.sessionsPerCycle,
      amount,
      effectiveFromCycle: open.cycleNumber + 1,
    });
    // TODO(US-35): audit log, the student's plan changed (NFR-06).
  }

  private async findGroupOrThrow(id: string): Promise<GroupRow> {
    const group = await this.groups.findById(id);
    if (!group) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
    return group;
  }
}
