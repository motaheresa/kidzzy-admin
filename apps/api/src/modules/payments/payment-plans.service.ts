import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type PaymentPlan } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AccessContext } from '../auth/access-context';
import { GroupRepository } from '../groups/group.repository';
import { InstructorRepository } from '../instructors/instructor.repository';
import { toDecimal } from '../prisma/money';
import { StudentRepository } from '../students/student.repository';
import type { ListPaymentPlansQueryDto } from './dto/list-payment-plans.query';
import type { InstructorPlanDto } from './dto/instructor-plan.dto';
import type { PlanInputDto } from './dto/plan-input.dto';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { toPaymentPlan } from './payment-plan.mapper';
import { PaymentPlanRepository } from './payment-plan.repository';

/**
 * Payment plan versions (US-20, US-21). A plan is never edited: a change adds the next version
 * (BR-10). A new version applies from the cycle after the one in progress, so the cycle in
 * progress keeps the plan it started with (AC); when it completes, the next cycle opens under
 * the version in effect for its number (US-22).
 *
 * A student has one plan line. An instructor is paid per group (ADR-0015): a plan belongs to an
 * (instructor, group) pair, with its own versions, its own starting point and its own cycles.
 *
 * Read scope (payments.read): `any` (the admin) reads every plan; `own` (an instructor) reads
 * only their own plans, and a student's plans are 403.
 */
@Injectable()
export class PaymentPlansService {
  constructor(
    private readonly plans: PaymentPlanRepository,
    private readonly cycles: PaymentCycleRepository,
    private readonly students: StudentRepository,
    private readonly instructors: InstructorRepository,
    private readonly groups: GroupRepository,
    private readonly access: AccessContext,
  ) {}

  /**
   * GET /payment-plans?studentId= or ?instructorId=: the versions of one payee, the first first.
   * For an instructor: every group they have a plan for, by group name then version, or only one
   * group's with groupId.
   */
  async list(query: ListPaymentPlansQueryDto): Promise<PaymentPlan[]> {
    const { studentId, instructorId, groupId } = query;
    if ((studentId === undefined) === (instructorId === undefined)) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'Send exactly one of studentId and instructorId',
        [{ field: 'studentId', message: 'Send exactly one of studentId and instructorId' }],
      );
    }
    if (groupId !== undefined && instructorId === undefined) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'groupId goes with instructorId',
        [{ field: 'groupId', message: 'groupId goes with instructorId' }],
      );
    }
    this.access.ensureOwner(this.access.scopeFor('payments.read'), instructorId ?? null);

    if (studentId !== undefined) {
      await this.findStudentOrThrow(studentId);
      return (await this.plans.listForStudent(studentId)).map(toPaymentPlan);
    }
    await this.findInstructorOrThrow(instructorId!);
    if (groupId !== undefined) await this.findGroupOrThrow(groupId);
    return (await this.plans.listForInstructor(instructorId!, groupId)).map(toPaymentPlan);
  }

  /**
   * POST /students/{id}/payment-plans (BR-10): the next version, from the cycle after the one in
   * progress. The student row is locked first, so two changes at once get consecutive versions.
   * A student who never had a plan has nothing to change (409): the plan starts at enrollment.
   * The same N and amount as the latest version changes nothing (409).
   */
  @Transactional()
  async changeStudentPlan(studentId: string, dto: PlanInputDto): Promise<PaymentPlan> {
    await this.students.lock(studentId);
    await this.findStudentOrThrow(studentId);

    const latest = await this.plans.findLatestForStudent(studentId);
    const open = await this.cycles.findOpenForStudent(studentId);
    if (!latest || !open) {
      throw new AppException(
        ErrorCode.StudentHasNoPlan,
        HttpStatus.CONFLICT,
        'The student has no plan yet: it starts when they are enrolled',
      );
    }
    const amount = toDecimal(dto.amount);
    if (latest.sessionsPerCycle === dto.sessionsPerCycle && latest.amount.equals(amount)) {
      throw new AppException(
        ErrorCode.PlanUnchanged,
        HttpStatus.CONFLICT,
        'The plan is already the latest version',
      );
    }

    const created = await this.plans.createForStudent({
      studentId,
      version: latest.version + 1,
      sessionsPerCycle: dto.sessionsPerCycle,
      amount,
      effectiveFromCycle: open.cycleNumber + 1,
    });
    // TODO(US-35): audit log, the student's plan changed (NFR-06).
    return toPaymentPlan(created);
  }

  /**
   * POST /instructors/{id}/payment-plans (US-21): the plan of one (instructor, group) pair
   * (ADR-0015). The pair's first plan is version 1 with cycle 1 counting from the starting point
   * (BR-14, 0..N-1), and it needs the instructor to be the group's current instructor (422
   * INSTRUCTOR_NOT_IN_GROUP). A later plan of the pair is the next version from the cycle after
   * the one in progress, like a student's (BR-10); it is allowed even when the instructor no
   * longer teaches the group, since the pair keeps its cycle. The starting point only exists for
   * the first cycle, so a later plan with one is refused (422). One transaction, the instructor's
   * user row locked first, so two changes at once get consecutive versions.
   */
  @Transactional()
  async setInstructorPlan(instructorId: string, dto: InstructorPlanDto): Promise<PaymentPlan> {
    await this.instructors.lock(instructorId);
    await this.findInstructorOrThrow(instructorId);
    const group = await this.groups.findById(dto.groupId);
    if (!group) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
    }

    const amount = toDecimal(dto.amount);
    const openingCount = dto.openingCount ?? 0;
    const latest = await this.plans.findLatestForInstructor(instructorId, group.id);

    if (!latest) {
      if (group.instructor.id !== instructorId) {
        throw new AppException(
          ErrorCode.InstructorNotInGroup,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'The first plan for a group needs the group’s current instructor',
          [{ field: 'groupId', message: 'The instructor does not teach this group' }],
        );
      }
      if (openingCount >= dto.sessionsPerCycle) {
        throw new AppException(
          ErrorCode.StartingPointOutOfRange,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'The starting point must be less than the sessions per cycle',
        );
      }
      const first = await this.plans.createForInstructor({
        instructorId,
        groupId: group.id,
        version: 1,
        sessionsPerCycle: dto.sessionsPerCycle,
        amount,
        effectiveFromCycle: 1,
      });
      await this.cycles.createFirstForInstructor(instructorId, group.id, first, openingCount);
      // TODO(US-35): audit log, the instructor's plan for the group was set (NFR-06).
      return toPaymentPlan(first);
    }

    if (openingCount !== 0) {
      throw new AppException(
        ErrorCode.StartingPointLocked,
        HttpStatus.CONFLICT,
        'The starting point only applies to the first plan of the group',
      );
    }
    const open = await this.cycles.findOpenForInstructor(instructorId, group.id);
    if (!open) {
      // BR-08 always opens the next cycle, so a pair with a plan has one in progress.
      throw new Error(
        `Instructor ${instructorId} has a plan for group ${group.id} but no cycle in progress`,
      );
    }
    if (latest.sessionsPerCycle === dto.sessionsPerCycle && latest.amount.equals(amount)) {
      throw new AppException(
        ErrorCode.PlanUnchanged,
        HttpStatus.CONFLICT,
        'The plan is already the latest version',
      );
    }
    const created = await this.plans.createForInstructor({
      instructorId,
      groupId: group.id,
      version: latest.version + 1,
      sessionsPerCycle: dto.sessionsPerCycle,
      amount,
      effectiveFromCycle: open.cycleNumber + 1,
    });
    // TODO(US-35): audit log, the instructor's plan for the group changed (NFR-06).
    return toPaymentPlan(created);
  }

  private async findStudentOrThrow(id: string): Promise<void> {
    if (!(await this.students.findById(id))) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such student');
    }
  }

  private async findInstructorOrThrow(id: string): Promise<void> {
    if (!(await this.instructors.findById(id))) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such instructor');
    }
  }

  private async findGroupOrThrow(id: string): Promise<void> {
    if (!(await this.groups.findById(id))) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
    }
  }
}
