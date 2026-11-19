import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AcademySettings } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { AcademySettingsService } from './academy-settings.service';
import { UpdateAcademySettingsDto } from './dto/update-academy-settings.dto';

/** /academy/settings (US-42): the admin's settings of the academy. */
@Controller('academy/settings')
export class AcademySettingsController {
  constructor(private readonly settings: AcademySettingsService) {}

  @RequirePermission('evaluations.manage')
  @Get()
  get(): Promise<AcademySettings> {
    return this.settings.get();
  }

  @RequirePermission('evaluations.manage')
  @Patch()
  update(@Body() dto: UpdateAcademySettingsDto): Promise<AcademySettings> {
    return this.settings.update(dto);
  }
}
