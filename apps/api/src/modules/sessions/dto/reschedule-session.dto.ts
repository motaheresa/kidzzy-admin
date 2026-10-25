import { IsISO8601, Matches } from 'class-validator';

/** POST /sessions/{id}/reschedule body (openapi.yaml: RescheduleRequest). */
export class RescheduleSessionDto {
  /**
   * An ISO 8601 instant with its zone (Z or an offset): without one the server would read it in
   * its own zone. The time of day is stored as the instant it names.
   */
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'scheduledAt must include a time zone (Z or an offset)',
  })
  scheduledAt!: string;
}
