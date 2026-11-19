import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenancy/tenant-context';

/** What a background job needs to know about an academy. */
export interface AcademyForJobs {
  id: string;
  timezone: string;
}

/**
 * Reads academies. Academy is the tenant itself, so it has no academy_id and the tenant-scoped
 * client does not filter it: every query here filters by id explicitly.
 */
@Injectable()
export class AcademyRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
  ) {}

  /** Whether a student cycle becoming Due asks for a blocking evaluation (US-42). In the open transaction. */
  async findEvaluationsRequired(): Promise<boolean> {
    const academy = await this.txHost.tx.academy.findUniqueOrThrow({
      where: { id: this.tenant.requireAcademyId() },
      select: { evaluationsRequired: true },
    });
    return academy.evaluationsRequired;
  }

  /** The current academy's id (the tenant), for an audit row about the academy itself. */
  currentId(): Promise<string> {
    return Promise.resolve(this.tenant.requireAcademyId());
  }

  /** Turns the evaluation rule on or off for the current academy. */
  async setEvaluationsRequired(value: boolean): Promise<void> {
    await this.txHost.tx.academy.update({
      where: { id: this.tenant.requireAcademyId() },
      data: { evaluationsRequired: value },
    });
  }

  /** The current academy's IANA timezone (Africa/Cairo): schedules and "today" use it. */
  async findTimezone(): Promise<string> {
    const academy = await this.prisma.db.academy.findUniqueOrThrow({
      where: { id: this.tenant.requireAcademyId() },
      select: { timezone: true },
    });
    return academy.timezone;
  }

  /**
   * EVERY ACADEMY, UNSCOPED ON PURPOSE: a background job (session generation, the reminder tick)
   * has no request and so no tenant yet; it lists the academies, then runs its work for each
   * inside tenant.run(). Login, refresh, and the push-subscription endpoint lookup are the
   * other reads that cross academies.
   */
  listForJobs(): Promise<AcademyForJobs[]> {
    return this.prisma.unscoped.academy.findMany({
      select: { id: true, timezone: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
