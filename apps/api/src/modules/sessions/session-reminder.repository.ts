import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { REMINDERS_PER_RUN, leadWindow } from './session-reminder.constants';

/** A scheduled session that still needs one lead. */
export interface DueSession {
  id: string;
  instructorId: string;
  scheduledAt: Date;
  groupName: string;
  /** The leads this session already has, so the caller does not send them again. */
  sentLeads: number[];
}

/**
 * Reads sessions that are due a reminder and records that a lead was sent (SCRUM-44).
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class SessionReminderRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * The soonest scheduled sessions that fall in the window of one of these leads and do not
   * already have that lead. At most REMINDERS_PER_RUN, so an older session is not left behind a
   * later one. Each session comes with the leads it already has.
   */
  async findDue(now: Date, leads: readonly number[]): Promise<DueSession[]> {
    const rows = await this.txHost.tx.session.findMany({
      where: {
        status: 'scheduled',
        OR: leads.map((lead) => {
          const window = leadWindow(now, lead);
          return {
            scheduledAt: { gt: window.after, lte: window.until },
            reminders: { none: { leadMinutes: lead } },
          };
        }),
      },
      select: {
        id: true,
        instructorId: true,
        scheduledAt: true,
        group: { select: { name: true } },
        reminders: { select: { leadMinutes: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: REMINDERS_PER_RUN,
    });
    return rows.map((row) => ({
      id: row.id,
      instructorId: row.instructorId,
      scheduledAt: row.scheduledAt,
      groupName: row.group.name,
      sentLeads: row.reminders.map((reminder) => reminder.leadMinutes),
    }));
  }

  /**
   * Claims this lead. ON CONFLICT DO NOTHING (skipDuplicates): false when the startup run or
   * another tick already took it, so the caller skips notify instead of throwing.
   */
  async claim(input: {
    sessionId: string;
    leadMinutes: number;
    instructorId: string;
    sentAt: Date;
  }): Promise<boolean> {
    const result = await this.txHost.tx.sessionReminder.createMany({
      data: [
        {
          id: randomUUID(),
          academyId: this.tenant.requireAcademyId(),
          sessionId: input.sessionId,
          leadMinutes: input.leadMinutes,
          instructorId: input.instructorId,
          sentAt: input.sentAt,
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }
}
