import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Page, type PaymentCycle } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import type { ListPaymentCyclesQueryDto } from './dto/list-payment-cycles.query';
import { toPaymentCycle } from './payment-cycle.mapper';
import { PaymentCycleRepository } from './payment-cycle.repository';

/**
 * Reading payment cycles (US-24, US-25, FR-18).
 *
 * Read scope (payments.read): `any` (the admin) reads every cycle and can filter by status,
 * payee type, student or instructor. `own` (an instructor) reads only their own cycles, one line
 * per group they are paid for (ADR-0015); a student's cycles, or another instructor's, are 403.
 * Without a filter the instructor gets their own cycles.
 */
@Injectable()
export class PaymentCyclesService {
  constructor(
    private readonly cycles: PaymentCycleRepository,
    private readonly access: AccessContext,
  ) {}

  async list(query: ListPaymentCyclesQueryDto): Promise<Page<PaymentCycle>> {
    const own = this.access.scopeFor('payments.read') === 'own';
    if (own) {
      const asksForStudents = query.payeeType === 'student' || query.studentId !== undefined;
      const asksForOthers =
        query.instructorId !== undefined && query.instructorId !== this.access.userId;
      if (asksForStudents || asksForOthers) {
        throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
      }
    }

    const { rows, total } = await this.cycles.list(
      {
        status: query.status,
        payeeType: own ? 'instructor' : query.payeeType,
        studentId: query.studentId,
        instructorId: own ? this.access.userId : query.instructorId,
      },
      pageWindow(query),
    );
    return toPage(rows.map(toPaymentCycle), query, total);
  }
}
