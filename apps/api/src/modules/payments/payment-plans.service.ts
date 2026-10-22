import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type PaymentPlan } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AccessContext } from '../auth/access-context';
import { InstructorRepository } from '../instructors/instructor.repository';
import { toDecimal } from '../prisma/money';
import { StudentRepository } from '../students/student.repository';
import type { ListPaymentPlansQueryDto } from './dto/list-payment-plans.query';
import type { PlanInputDto } from './dto/plan-input.dto';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { toPaymentPlan } from './payment-plan.mapper';
import { PaymentPlanRepository } from './payment-plan.repository';

/**
 * Payment plan versions (US-20, US-21). A plan is never edited: a change adds the next version
 * (BR-10). A student's new version applies from the cycle after the one in progress, so the
 * cycle in progress keeps the plan it started with (AC); when it completes, the next cycle opens
 * under the version in effect for its number (US-22).
 *
 * Read scope (payments.read): `any` (the admin) reads every plan; `own` (an instructor) reads
 * only their own plan, and a student's plans are 403.
 */
@Injectable()
export class PaymentPlansService {
  constructor(
    private readonly plans: PaymentPlanRepository,
    private readonly cycles: PaymentCycleRepository,
    private readonly students: StudentRepository,
    private readonly instructors: InstructorRepository,
    private readonly access: AccessContext,
  ) {}

  /** GET /payment-plans?studentId= or ?instructorId=: the versions of one payee, the first first. */
  async list(query: ListPaymentPlansQueryDto): Promise<PaymentPlan[]> {
    const { studentId, instructorId } = query;
    if ((studentId === undefined) === (instructorId === undefined)) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'Send exactly one of studentId and instructorId',
        [{ field: 'studentId', message: 'Send exactly one of studentId and instructorId' }],
      );
    }
    this.access.ensureOwner(this.access.scopeFor('payments.read'), instructorId ?? null);

    if (studentId !== undefined) {
      await this.findStudentOrThrow(studentId);
      return (await this.plans.listForStudent(studentId)).map(toPaymentPlan);
    }
    await this.findInstructorOrThrow(instructorId!);
    return (await this.plans.listForInstructor(instructorId!)).map(toPaymentPlan);
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
}
