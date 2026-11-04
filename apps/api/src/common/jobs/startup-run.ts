import type { Logger } from '@nestjs/common';

/** True in production. createTestApp overrides it to false so e2e never runs jobs at boot. */
export const RUN_JOBS_ON_STARTUP = Symbol('RUN_JOBS_ON_STARTUP');

const STARTUP_DELAY_MS = 5_000;

/**
 * One run a few seconds after the process starts, not awaited, so boot stays fast and a failure
 * is only a log line. Tests turn it off: createTestApp boots the API for every file.
 */
export function scheduleStartupRun(
  enabled: boolean,
  run: () => Promise<void>,
  logger: Logger,
): void {
  if (!enabled) return;
  setTimeout(() => {
    void run().catch((error: unknown) => {
      logger.error('Startup run failed', error instanceof Error ? error.stack : String(error));
    });
  }, STARTUP_DELAY_MS);
}
