import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Enrollment } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AuditService } from '../audit/audit.service';
import { planAudit } from '../payments/plan-audit';
import { AccessContext } from '../auth/access-context';
import { GroupRepository, type GroupRow } from '../groups/group.repository';
import { PaymentCycleRepository } from '../payments/payment-cycle.repository';
import { PaymentPlanRepository } from '../payments/payment-plan.repository';
import { toDecimal } from '../prisma/money';
import { dateToString } from '../sessions/dates';
import { addDays } from '../sessions/occurrences';
import { StudentRepository } from '../students/student.repository';
import type { EnrollStudentDto } from './dto/enroll-student.dto';
import type { TransferStudentDto } from './dto/transfer-student.dto';
import { alreadyEnrolled, EnrollmentRepository } from './enrollment.repository';
import { toEnrollment } from './enrollment.mapper';

/**
 * A student joins a group with a payment plan (US-08) and a starting point (US-36), moves to
 * another group (US-09) and has a group history.
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
    private readonly audit: AuditService,
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

  /**
   * POST /students/{id}/transfer (US-09, BR-11), in one transaction: the open enrollment ends and
   * a new one opens in the target group. With effectiveDate D, the old one ends on D - 1 and the
   * new one starts on D, so a day never belongs to two enrollments. The plan and the cycles are
   * the student's, so they are not touched: the cycle in progress keeps its id, its counter and
   * its plan (AC-04); the target group only counts sessions held from D on (US-22).
   * D may not be before the day the old enrollment started.
   */
  @Transactional()
  async transfer(studentId: string, dto: TransferStudentDto): Promise<Enrollment> {
    await this.students.lock(studentId);
    const student = await this.students.findById(studentId);
    if (!student) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such student');
    }
    const target = await this.findGroupOrThrow(dto.toGroupId);

    const open = student.enrollments[0];
    if (!open) {
      throw new AppException(
        ErrorCode.NoActiveEnrollment,
        HttpStatus.CONFLICT,
        'The student is not in a group',
      );
    }
    if (open.group.id === target.id) {
      throw new AppException(
        ErrorCode.SameGroup,
        HttpStatus.CONFLICT,
        'The student is already in this group',
      );
    }
    if (!target.isActive) {
      throw new AppException(ErrorCode.GroupInactive, HttpStatus.CONFLICT, 'The group is inactive');
    }
    if (dto.effectiveDate < dateToString(open.startDate)) {
      throw new AppException(
        ErrorCode.EnrollmentDateInvalid,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The date cannot be before the student joined the current group',
      );
    }

    // The old one first: the partial unique index allows one open enrollment per student.
    await this.enrollments.closeOpen(studentId, addDays(dto.effectiveDate, -1));
    const enrollment = await this.enrollments.create({
      studentId,
      groupId: target.id,
      startDate: dto.effectiveDate,
    });
    await this.audit.record({
      action: 'enrollment.transferred',
      entityType: 'students',
      entityId: studentId,
      before: { groupId: open.group.id, startDate: dateToString(open.startDate), endDate: null },
      after: {
        groupId: target.id,
        startDate: dto.effectiveDate,
        previousGroupEndDate: addDays(dto.effectiveDate, -1),
      },
    });
    return toEnrollment(enrollment);
  }

  /**
   * GET /students/{id}/enrollments: the student's group history, the latest first. Scope `own`:
   * only a student in a group the caller teaches, like reading the student (403 otherwise).
   */
  async listForStudent(studentId: string): Promise<Enrollment[]> {
    const student = await this.students.findById(studentId);
    if (!student) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such student');
    }
    this.access.ensureOwner(
      this.access.scopeFor('students.read'),
      student.enrollments[0]?.group.instructorId ?? null,
    );
    return (await this.enrollments.listForStudent(studentId)).map(toEnrollment);
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
    await this.audit.record({
      action: 'payment_plan.set',
      entityType: 'payment_plans',
      entityId: plan.id,
      after: planAudit(plan, openingCount),
    });
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
    const created = await this.plans.createForStudent({
      studentId,
      version: latest.version + 1,
      sessionsPerCycle: dto.plan.sessionsPerCycle,
      amount,
      effectiveFromCycle: open.cycleNumber + 1,
    });
    await this.audit.record({
      action: 'payment_plan.changed',
      entityType: 'payment_plans',
      entityId: created.id,
      before: planAudit(latest),
      after: planAudit(created),
    });
  }

  private async findGroupOrThrow(id: string): Promise<GroupRow> {
    const group = await this.groups.findById(id);
    if (!group) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
    return group;
  }
}
