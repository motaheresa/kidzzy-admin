import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RUN_JOBS_ON_STARTUP, scheduleStartupRun } from '../../common/jobs/startup-run';
import { AcademyRepository } from '../academies/academy.repository';
import { QUARTER_HOUR_CRON } from '../notifications/quarter-hour';
import { TenantContext } from '../tenancy/tenant-context';
import { SessionReportService } from './session-report.service';

/**
 * The "not marked yet" report (SCRUM-43, ADR-0016), on the same quarter hour as the push tick and
 * the session reminders. The only report that needs a clock: a session nobody marked writes
 * nothing, so nothing could trigger it. Held and cancelled are sent by the write itself.
 * Tests call reportAll and never wait for the cron.
 */
@Injectable()
export class SessionReportJob {
  private readonly logger = new Logger(SessionReportJob.name);

  constructor(
    private readonly academies: AcademyRepository,
    private readonly tenant: TenantContext,
    private readonly reports: SessionReportService,
    @Inject(RUN_JOBS_ON_STARTUP) runOnStartup: boolean,
  ) {
    scheduleStartupRun(runOnStartup, () => this.reportAll(), this.logger);
  }

  @Cron(QUARTER_HOUR_CRON)
  run(): Promise<void> {
    return this.reportAll();
  }

  /** Public so tests run the work without waiting for the quarter hour. */
  async reportAll(): Promise<void> {
    for (const academy of await this.academies.listForJobs()) {
      try {
        await this.tenant.run(academy.id, () => this.reportAcademy());
      } catch (error) {
        this.logger.error(
          `Session reports failed for academy ${academy.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * One academy. A failure of one session stays in this loop: the list is oldest-first, so a
   * session that keeps failing would otherwise stay first and block the later ones.
   */
  private async reportAcademy(): Promise<void> {
    const { sessions, zone, now } = await this.reports.listUnmarked();
    for (const session of sessions) {
      try {
        await this.reports.reportUnmarked(session, zone, now);
      } catch {
        // The session id only: the error can carry the report text, and that stays out of the log.
        this.logger.error(`Unmarked report failed for session ${session.id}`);
      }
    }
  }
}
