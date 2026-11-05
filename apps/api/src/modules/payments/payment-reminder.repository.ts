import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import type { PaymentReminderSessionsLeft } from './payment-reminder.constants';

/**
 * Records that a cycle's threshold was reminded (SCRUM-45). Queries go through `txHost.tx`,
 * limited to the academy in TenantContext.
 */
@Injectable()
export class PaymentReminderRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Claims this cycle and threshold. ON CONFLICT DO NOTHING (skipDuplicates): false when an
   * earlier Held already took it, including after an undo, so the caller leaves that payee out
   * instead of throwing.
   */
  async claim(input: {
    cycleId: string;
    sessionsLeft: PaymentReminderSessionsLeft;
    sentAt: Date;
  }): Promise<boolean> {
    const result = await this.txHost.tx.paymentReminder.createMany({
      data: [
        {
          id: randomUUID(),
          academyId: this.tenant.requireAcademyId(),
          cycleId: input.cycleId,
          sessionsLeft: input.sessionsLeft,
          sentAt: input.sentAt,
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }
}
