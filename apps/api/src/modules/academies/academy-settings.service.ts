import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { AcademySettings } from '@kidzzy/shared';
import { AuditService } from '../audit/audit.service';
import { AcademyRepository } from './academy.repository';
import type { UpdateAcademySettingsDto } from './dto/update-academy-settings.dto';

/** The academy's settings (US-42 adds the first one). Every change is audited. */
@Injectable()
export class AcademySettingsService {
  constructor(
    private readonly academies: AcademyRepository,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<AcademySettings> {
    return { evaluationsRequired: await this.academies.findEvaluationsRequired() };
  }

  /**
   * Turning the rule off leaves the cycle_due requests pending but no longer blocking; turning it
   * back on makes them block again. A request from the admin blocks whatever the setting.
   */
  @Transactional()
  async update(dto: UpdateAcademySettingsDto): Promise<AcademySettings> {
    const before = await this.academies.findEvaluationsRequired();
    if (before !== dto.evaluationsRequired) {
      await this.academies.setEvaluationsRequired(dto.evaluationsRequired);
      await this.audit.record({
        action: 'academy.settings_updated',
        entityType: 'academies',
        entityId: await this.academyId(),
        before: { evaluationsRequired: before },
        after: { evaluationsRequired: dto.evaluationsRequired },
      });
    }
    return { evaluationsRequired: dto.evaluationsRequired };
  }

  private academyId(): Promise<string> {
    return this.academies.currentId();
  }
}
