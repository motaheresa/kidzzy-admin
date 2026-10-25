import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { DateTime } from 'luxon';
import { ErrorCode, type Page, type Payment } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AcademyRepository } from '../academies/academy.repository';
import { AccessContext } from '../auth/access-context';
import { AuditService } from '../audit/audit.service';
import { toDecimal, toMoney } from '../prisma/money';
import { Clock } from '../sessions/clock';
import type { ListPaymentsQueryDto } from './dto/list-payments.query';
import type { PaymentCreateDto } from './dto/payment-create.dto';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { toPayment } from './payment.mapper';
import { PaymentRepository } from './payment.repository';

const notFound = () =>
  new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such payment cycle');

/**
 * Recording the payment of a Due cycle (US-23, BR-09). A student's or an instructor's cycle (an
 * instructor's is per group, ADR-0015) is settled by exactly one payment: no partial payments.
 * Undoing or editing a payment is not part of this story.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly cycles: PaymentCycleRepository,
    private readonly payments: PaymentRepository,
    private readonly academies: AcademyRepository,
    private readonly clock: Clock,
    private readonly access: AccessContext,
    private readonly audit: AuditService,
  ) {}

  /**
   * The payment history (US-24, US-25), newest first. Scope `any` (the admin) filters by payee,
   * student, instructor and an academy-local date range, both ends included. Scope `own` (an
   * instructor) reads only their own payments, the same rule as the cycles: a student's, or
   * another instructor's, are 403, and without a filter they get their own.
   */
  async list(query: ListPaymentsQueryDto): Promise<Page<Payment>> {
    if (query.from && query.to && query.from > query.to) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'from must not be after to',
        [{ field: 'from', message: 'from must not be after to' }],
      );
    }
    const own = this.access.scopeFor('payments.read') === 'own';
    if (own) {
      const asksForStudents = query.payeeType === 'student' || query.studentId !== undefined;
      const asksForOthers =
        query.instructorId !== undefined && query.instructorId !== this.access.userId;
      if (asksForStudents || asksForOthers) {
        throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
      }
    }

    const { rows, total } = await this.payments.list(
      {
        payeeType: own ? 'instructor' : query.payeeType,
        studentId: query.studentId,
        instructorId: own ? this.access.userId : query.instructorId,
        from: query.from,
        to: query.to,
      },
      pageWindow(query),
    );
    return toPage(rows.map(toPayment), query, total);
  }

  /**
   * Two layers keep a cycle from being paid twice. First the cycle row is locked (SELECT … FOR
   * UPDATE) and read again, so a second request waits for the first and then finds the cycle
   * already paid (409 CYCLE_ALREADY_PAID). The UNIQUE on payments.cycle_id is the last safety net
   * if anything ever writes around this code.
   *
   * Only a Due cycle can be paid (an in-progress one is 409 CYCLE_NOT_DUE). The amount must
   * equal the cycle's plan amount, compared as a decimal (422 AMOUNT_MISMATCH), and the date,
   * an academy-local day, cannot be after today (422 PAID_ON_IN_FUTURE); a past date is fine.
   * The payment and the cycle becoming paid are one transaction.
   */
  @Transactional()
  async record(cycleId: string, dto: PaymentCreateDto): Promise<Payment> {
    if (!(await this.cycles.findById(cycleId))) throw notFound();
    await this.cycles.lock(cycleId);
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw notFound();

    if (cycle.status === 'in_progress') {
      throw new AppException(
        ErrorCode.CycleNotDue,
        HttpStatus.CONFLICT,
        'The cycle has not reached its session count yet',
      );
    }
    if (cycle.status === 'paid') {
      throw new AppException(
        ErrorCode.CycleAlreadyPaid,
        HttpStatus.CONFLICT,
        'The cycle is already paid',
      );
    }

    const amount = toDecimal(dto.amount);
    if (!amount.equals(cycle.plan.amount)) {
      throw new AppException(
        ErrorCode.AmountMismatch,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The amount must equal the plan amount',
        [{ field: 'amount', message: 'The amount must equal the plan amount' }],
      );
    }

    const now = this.clock.now();
    const zone = await this.academies.findTimezone();
    const today = DateTime.fromJSDate(now, { zone }).toISODate();
    if (!today) throw new Error('The clock has no local date');
    if (dto.paidOn > today) {
      throw new AppException(
        ErrorCode.PaidOnInFuture,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The payment date cannot be after today',
        [{ field: 'paidOn', message: 'The payment date cannot be after today' }],
      );
    }

    const created = await this.payments.create({
      cycleId,
      amount,
      paidOn: dto.paidOn,
      method: dto.method,
      note: dto.note?.trim() ? dto.note.trim() : null,
      recordedById: this.access.userId,
    });
    await this.cycles.markPaid(cycleId, now);

    // TODO(US-28): tell the instructor their payment was recorded (an instructor's cycle).
    // The note is free text and stays out of the log; the money and the cycle's status are in.
    await this.audit.record({
      action: 'payment.recorded',
      entityType: 'payment_cycles',
      entityId: cycleId,
      before: { cycleStatus: cycle.status },
      after: {
        cycleStatus: 'paid',
        paymentId: created.id,
        amount: toMoney(amount),
        paidOn: dto.paidOn,
        method: dto.method,
      },
    });
    return toPayment(created);
  }
}
