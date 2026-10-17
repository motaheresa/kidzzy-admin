import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { Clock } from './clock';
import { SessionGenerationJob } from './session-generation.job';
import { SessionGenerator } from './session-generator';
import { SessionRepository } from './session.repository';

/** Sessions (US-11): for now only their generation from the weekly schedules. */
@Module({
  imports: [AcademiesModule],
  providers: [Clock, SessionRepository, SessionGenerator, SessionGenerationJob],
  exports: [Clock, SessionGenerator],
})
export class SessionsModule {}
