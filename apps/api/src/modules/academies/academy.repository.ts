import { Injectable } from '@nestjs/common';
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
  ) {}

  /** The current academy's IANA timezone (Africa/Cairo): schedules and "today" use it. */
  async findTimezone(): Promise<string> {
    const academy = await this.prisma.db.academy.findUniqueOrThrow({
      where: { id: this.tenant.requireAcademyId() },
      select: { timezone: true },
    });
    return academy.timezone;
  }

  /**
   * EVERY ACADEMY, UNSCOPED ON PURPOSE: a background job (session generation) has no request and
   * so no tenant yet; it lists the academies, then runs its work for each inside tenant.run().
   * The only place besides login and refresh that crosses academies.
   */
  listForJobs(): Promise<AcademyForJobs[]> {
    return this.prisma.unscoped.academy.findMany({
      select: { id: true, timezone: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
