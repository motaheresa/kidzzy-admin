import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { Clock } from './clock';
import { SessionRegeneration } from './session-regeneration';
import { SessionGenerationJob } from './session-generation.job';
import { SessionGenerator } from './session-generator';
import { SessionRepository } from './session.repository';

/** Sessions (US-11): their generation from the weekly schedules and what an edit of a group does to them. */
@Module({
  imports: [AcademiesModule],
  providers: [
    Clock,
    SessionRepository,
    SessionGenerator,
    SessionRegeneration,
    SessionGenerationJob,
  ],
  exports: [Clock, SessionGenerator, SessionRegeneration],
})
export class SessionsModule {}
