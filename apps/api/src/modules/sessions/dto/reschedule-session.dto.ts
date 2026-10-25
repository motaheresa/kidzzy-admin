import { IsZonedInstant } from '../../../common/validation/is-zoned-instant';

/** POST /sessions/{id}/reschedule body (openapi.yaml: RescheduleRequest). */
export class RescheduleSessionDto {
  /** An ISO 8601 instant with its zone; the time of day is stored as the instant it names. */
  @IsZonedInstant()
  scheduledAt!: string;
}
