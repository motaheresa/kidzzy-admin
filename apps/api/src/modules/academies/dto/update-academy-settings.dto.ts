import { IsBoolean } from 'class-validator';

/** PATCH /academy/settings body (openapi.yaml: AcademySettingsUpdate). */
export class UpdateAcademySettingsDto {
  @IsBoolean()
  evaluationsRequired!: boolean;
}
