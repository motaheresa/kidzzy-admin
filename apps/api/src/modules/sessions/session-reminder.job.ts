import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { scheduleStartupRun, RUN_JOBS_ON_STARTUP } from '../../common/jobs/startup-run';
import { AcademyRepository } from '../academies/academy.repository';
import { QUARTER_HOUR_CRON } from '../notifications/quarter-hour';
import { TenantContext } from '../tenancy/tenant-context';
import { SessionReminderService } from './session-reminder.service';

/**
 * Session reminders (ADR-0016), on the same quarter hour as the push tick. A separate job, so a
 * push failure cannot stop a reminder. Tests call remindAll and never wait for the cron.
 */
@Injectable()
export class SessionReminderJob {
  private readonly logger = new Logger(SessionReminderJob.name);

  constructor(
    private readonly academies: AcademyRepository,
    private readonly tenant: TenantContext,
    private readonly reminders: SessionReminderService,
    @Inject(RUN_JOBS_ON_STARTUP) runOnStartup: boolean,
  ) {
    scheduleStartupRun(runOnStartup, () => this.remindAll(), this.logger);
  }

  @Cron(QUARTER_HOUR_CRON)
  run(): Promise<void> {
    return this.remindAll();
  }

  /** Public so tests run the work without waiting for the quarter hour. */
  async remindAll(): Promise<void> {
    for (const academy of await this.academies.listForJobs()) {
      try {
        await this.tenant.run(academy.id, () => this.remindAcademy());
      } catch (error) {
        this.logger.error(
          `Session reminders failed for academy ${academy.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** One academy: list, then one transaction per lead. A duplicate claim does not throw. */
  private async remindAcademy(): Promise<void> {
    const due = await this.reminders.listDue();
    for (const reminder of due) {
      await this.reminders.sendOne(reminder);
    }
  }
}
