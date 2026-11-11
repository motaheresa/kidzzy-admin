import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ErrorCode, type ReminderRuleType } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import type { Prisma } from '../../generated/prisma/client';
import { uniqueViolationIndex } from '../prisma/prisma-errors';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

const RULE_SELECT = {
  id: true,
  type: true,
  leadMinutes: true,
  sessionsBeforeEnd: true,
  isActive: true,
} as const satisfies Prisma.ReminderRuleSelect;

export type ReminderRuleRow = Prisma.ReminderRuleGetPayload<{ select: typeof RULE_SELECT }>;

/** The two unique indexes that refuse the same value twice in a type. */
const DUPLICATE_INDEXES = new Set([
  'reminder_rules_academy_id_type_lead_minutes_key',
  'reminder_rules_academy_id_type_sessions_before_end_key',
]);

/**
 * The academy's reminder rules (US-30). The only class that queries them; the reminder jobs read
 * the active values through the two `active…` methods. Queries go through `txHost.tx`, limited to
 * the academy in TenantContext.
 */
@Injectable()
export class ReminderRuleRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  list(): Promise<ReminderRuleRow[]> {
    return this.txHost.tx.reminderRule.findMany({
      select: RULE_SELECT,
      orderBy: [{ type: 'asc' }, { leadMinutes: 'asc' }, { sessionsBeforeEnd: 'asc' }],
    });
  }

  findById(id: string): Promise<ReminderRuleRow | null> {
    return this.txHost.tx.reminderRule.findFirst({ where: { id }, select: RULE_SELECT });
  }

  countByType(type: ReminderRuleType): Promise<number> {
    return this.txHost.tx.reminderRule.count({ where: { type } });
  }

  /**
   * Locks the academy row until the end of the transaction, so two creates cannot both pass the
   * limit of a type. Call it first in a @Transactional() create. Raw SQL: it filters by id itself.
   */
  async lockAcademy(): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM academies
      WHERE id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  /** The lead of every active session rule, in minutes before the session, smallest first. */
  async activeLeadMinutes(): Promise<number[]> {
    const rows = await this.txHost.tx.reminderRule.findMany({
      where: { type: 'session_reminder', isActive: true },
      select: { leadMinutes: true },
      orderBy: { leadMinutes: 'asc' },
    });
    return rows.flatMap((row) => (row.leadMinutes === null ? [] : [row.leadMinutes]));
  }

  /** The sessions left of every active payment rule of this type (student or instructor). */
  async activeSessionsBeforeEnd(type: 'student_payment' | 'instructor_payment'): Promise<number[]> {
    const rows = await this.txHost.tx.reminderRule.findMany({
      where: { type, isActive: true },
      select: { sessionsBeforeEnd: true },
      orderBy: { sessionsBeforeEnd: 'asc' },
    });
    return rows.flatMap((row) => (row.sessionsBeforeEnd === null ? [] : [row.sessionsBeforeEnd]));
  }

  async create(input: {
    type: ReminderRuleType;
    leadMinutes: number | null;
    sessionsBeforeEnd: number | null;
  }): Promise<ReminderRuleRow> {
    try {
      return await this.txHost.tx.reminderRule.create({
        data: { academyId: this.tenant.requireAcademyId(), ...input },
        select: RULE_SELECT,
      });
    } catch (error) {
      throw asConflict(error);
    }
  }

  async update(
    id: string,
    data: { leadMinutes?: number; sessionsBeforeEnd?: number; isActive?: boolean },
  ): Promise<ReminderRuleRow> {
    try {
      return await this.txHost.tx.reminderRule.update({
        where: { id_academyId: { id, academyId: this.tenant.requireAcademyId() } },
        data,
        select: RULE_SELECT,
      });
    } catch (error) {
      throw asConflict(error);
    }
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.reminderRule.delete({
      where: { id_academyId: { id, academyId: this.tenant.requireAcademyId() } },
    });
  }
}

/** The same value twice in a type becomes its 409; any other error is returned as it is. */
function asConflict(error: unknown): unknown {
  const index = uniqueViolationIndex(error);
  if (index && DUPLICATE_INDEXES.has(index)) {
    return new AppException(
      ErrorCode.ReminderRuleExists,
      HttpStatus.CONFLICT,
      'This reminder rule already exists',
    );
  }
  return error;
}
