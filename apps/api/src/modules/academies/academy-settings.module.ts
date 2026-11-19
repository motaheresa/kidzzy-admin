import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AcademiesModule } from './academies.module';
import { AcademySettingsController } from './academy-settings.controller';
import { AcademySettingsService } from './academy-settings.service';

/**
 * The academy's settings screen (GET/PATCH /academy/settings). Its own module so AcademiesModule,
 * which many modules import for the repository, keeps no controller and no audit dependency.
 */
@Module({
  imports: [AcademiesModule, AuditModule],
  controllers: [AcademySettingsController],
  providers: [AcademySettingsService],
})
export class AcademySettingsModule {}
