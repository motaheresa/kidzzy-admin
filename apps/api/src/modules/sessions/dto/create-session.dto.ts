import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsZonedInstant } from '../../../common/validation/is-zoned-instant';

/** POST /groups/{id}/sessions body (openapi.yaml: SessionCreate). Same bounds as a slot's duration. */
export class CreateSessionDto {
  /** An ISO 8601 instant with its zone, the same rule as a reschedule. */
  @IsZonedInstant()
  scheduledAt!: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMin!: number;

  /** The Cancelled session of the same group this one makes up for. Left out for an extra session. */
  @IsOptional()
  @IsUUID()
  compensatesSessionId?: string;
}
