import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AcademyRepository } from '../academies/academy.repository';
import { TenantContext } from '../tenancy/tenant-context';
import { Clock } from './clock';
import { addDays, laterDate, localDateOf, planSessions } from './occurrences';
import { SessionRepository, type GroupToGenerate } from './session.repository';

/**
 * Generates the Scheduled sessions of the weekly schedules (FR-09, US-11).
 *
 * For each ACTIVE group: from max(today, the group's start date) to today +
 * SESSION_GENERATION_WEEKS weeks, one session per slot per matching day, at the slot's local time
 * in the academy's timezone. Safe to repeat: existing days are skipped by the database.
 * It runs inside the caller's tenant context (a request, or tenant.run() in the job).
 */
@Injectable()
export class SessionGenerator {
  private readonly logger = new Logger(SessionGenerator.name);

  constructor(
    private readonly sessions: SessionRepository,
    private readonly academies: AcademyRepository,
    private readonly tenant: TenantContext,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  /** One group, right after it is created or reactivated. Returns how many sessions are new. */
  async generateForGroup(groupId: string): Promise<number> {
    return this.generate(await this.sessions.findGroupsToGenerate(groupId));
  }

  /** Every active group of the current academy (the daily job). */
  async generateForAcademy(): Promise<number> {
    const created = await this.generate(await this.sessions.findGroupsToGenerate());
    this.logger.log(`Academy ${this.tenant.requireAcademyId()}: ${created} new sessions`);
    return created;
  }

  private async generate(groups: GroupToGenerate[]): Promise<number> {
    if (groups.length === 0) return 0;
    const zone = await this.academies.findTimezone();
    const today = localDateOf(this.clock.now(), zone);
    const last = addDays(today, this.config.getOrThrow<number>('SESSION_GENERATION_WEEKS') * 7 - 1);

    let created = 0;
    for (const group of groups) {
      const from = laterDate(today, group.startDate);
      created += await this.sessions.createPlanned(
        group,
        planSessions(group.slots, { from, to: last }, zone),
      );
    }
    return created;
  }
}
