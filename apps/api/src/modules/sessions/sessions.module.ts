import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { Clock } from './clock';
import { SessionHeldHooks } from './session-held-hooks';
import { SessionRegeneration } from './session-regeneration';
import { SessionGenerationJob } from './session-generation.job';
import { SessionGenerator } from './session-generator';
import { SessionRepository } from './session.repository';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/**
 * Sessions: generation from the weekly schedules (US-11), reading them (US-12) and marking
 * one Held (US-13). The repository is exported for attendance (US-18).
 * The repository stays inside this module; groups already import it, so it does not
 * import GroupRepository back.
 */
@Module({
  imports: [AcademiesModule],
  controllers: [SessionsController],
  providers: [
    Clock,
    SessionRepository,
    SessionGenerator,
    SessionRegeneration,
    SessionGenerationJob,
    SessionsService,
    SessionHeldHooks,
  ],
  exports: [Clock, SessionGenerator, SessionRegeneration, SessionRepository, SessionHeldHooks],
})
export class SessionsModule {}
