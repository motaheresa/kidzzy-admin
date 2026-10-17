import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AcademyRepository } from '../academies/academy.repository';
import { TenantContext } from '../tenancy/tenant-context';
import { SessionGenerator } from './session-generator';

/**
 * The daily generation job (ADR-0007: @nestjs/schedule in the API process, one instance).
 * Every night at 03:00 Cairo time it tops the horizon up for every academy. It is safe to run
 * twice, or while a request generates for a new group: the database skips existing days.
 */
@Injectable()
export class SessionGenerationJob {
  private readonly logger = new Logger(SessionGenerationJob.name);

  constructor(
    private readonly academies: AcademyRepository,
    private readonly tenant: TenantContext,
    private readonly generator: SessionGenerator,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'Africa/Cairo' })
  async run(): Promise<void> {
    await this.generateForAllAcademies();
  }

  /** Public so tests can run the job's work without waiting for 03:00. Returns the new total. */
  async generateForAllAcademies(): Promise<number> {
    let total = 0;
    // The job has no request, so no tenant: it lists the academies (unscoped, on purpose), then
    // works inside each one with tenant.run(), so every query is scoped to it.
    for (const academy of await this.academies.listForJobs()) {
      try {
        total += await this.tenant.run(academy.id, () => this.generator.generateForAcademy());
      } catch (error) {
        // One academy failing must not stop the others; tomorrow's run tries it again.
        this.logger.error(
          `Session generation failed for academy ${academy.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return total;
  }
}
