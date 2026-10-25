import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Page, type PaymentCycle } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { AuditService } from '../audit/audit.service';
import type { ListPaymentCyclesQueryDto } from './dto/list-payment-cycles.query';
import type { StartingPointDto } from './dto/starting-point.dto';
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
    private readonly audit: AuditService,
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

  /**
   * Corrects the starting point of a payee's FIRST cycle (US-36, BR-14): the sessions taken
   * before the system. It is allowed while that cycle is in progress, even after Held sessions
   * counted in it; a later cycle, a Due cycle or a paid one is 409 STARTING_POINT_LOCKED. For an
   * instructor "first" is the first cycle of that (instructor, group) pair (ADR-0015).
   *
   * The counter is recomputed, not adjusted: sessions_counted = the new starting point + the
   * cycle's cycle_sessions rows. Those rows are exactly the sessions counted, so the result is
   * right whatever the old counter was (adding the difference would carry any earlier slip
   * along), and it is the same equality the database checks. A result that reaches N is 422
   * STARTING_POINT_OUT_OF_RANGE, so a correction never makes a cycle Due by itself.
   *
   * The cycle row is locked and read again first: a Held session counting into it at the same
   * time waits, and the recomputation sees its row. One UPDATE writes both numbers, and the
   * change goes to the audit log.
   */
  @Transactional()
  async setStartingPoint(id: string, dto: StartingPointDto): Promise<PaymentCycle> {
    if (!(await this.cycles.findById(id))) throw notFound();
    await this.cycles.lock(id);
    const cycle = await this.cycles.findById(id);
    if (!cycle) throw notFound();

    if (cycle.cycleNumber !== 1 || cycle.status !== 'in_progress') {
      throw new AppException(
        ErrorCode.StartingPointLocked,
        HttpStatus.CONFLICT,
        'The starting point can only be changed on a first cycle that is in progress',
      );
    }
    const counted = dto.openingCount + (await this.cycles.countSessions(id));
    if (dto.openingCount >= cycle.sessionsPerCycle || counted >= cycle.sessionsPerCycle) {
      throw new AppException(
        ErrorCode.StartingPointOutOfRange,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The starting point and the sessions already counted must stay below the sessions per cycle',
        [{ field: 'openingCount', message: 'Too high for this cycle' }],
      );
    }

    await this.cycles.setStartingPoint(id, dto.openingCount, counted);
    await this.audit.record({
      action: 'payment_cycle.starting_point_set',
      entityType: 'payment_cycles',
      entityId: id,
      before: { openingCount: cycle.openingCount, sessionsCounted: cycle.sessionsCounted },
      after: { openingCount: dto.openingCount, sessionsCounted: counted },
    });

    const updated = await this.cycles.findById(id);
    if (!updated) throw notFound();
    return toPaymentCycle(updated);
  }
}

const notFound = () =>
  new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such payment cycle');
