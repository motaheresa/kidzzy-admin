import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { scheduleStartupRun, RUN_JOBS_ON_STARTUP } from '../../common/jobs/startup-run';
import { AcademyRepository } from '../academies/academy.repository';
import { TenantContext } from '../tenancy/tenant-context';
import { JOBS_PER_TICK } from './push.constants';
import { QUARTER_HOUR_CRON } from './quarter-hour';
import { ReminderDelivery } from './reminder.delivery';

/**
 * The quarter-hour push tick (ADR-0007, amended by ADR-0016). It calls deliverDue, which tests
 * call directly: nothing here waits for the cron. One academy's failure is logged and the next
 * academy still runs.
 */
@Injectable()
export class ReminderJob {
  private readonly logger = new Logger(ReminderJob.name);

  constructor(
    private readonly academies: AcademyRepository,
    private readonly tenant: TenantContext,
    private readonly delivery: ReminderDelivery,
    @Inject(RUN_JOBS_ON_STARTUP) runOnStartup: boolean,
  ) {
    scheduleStartupRun(runOnStartup, () => this.deliverDue(), this.logger);
  }

  @Cron(QUARTER_HOUR_CRON)
  tick(): Promise<void> {
    return this.deliverDue();
  }

  async deliverDue(): Promise<void> {
    for (const academy of await this.academies.listForJobs()) {
      try {
        await this.tenant.run(academy.id, () => this.deliverAcademy());
      } catch (error) {
        this.logger.error(
          `Reminder tick failed for academy ${academy.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** At most JOBS_PER_TICK sends. Each one is its own transaction, so a slow send holds one row. */
  private async deliverAcademy(): Promise<void> {
    for (let sent = 0; sent < JOBS_PER_TICK; sent += 1) {
      const tookOne = await this.delivery.deliverOne();
      if (!tookOne) return;
    }
  }
}
