import { IsInt, Max, Min } from 'class-validator';
import { MAX_SESSIONS_PER_CYCLE } from './plan-input.dto';

/**
 * PUT /payment-cycles/{id}/starting-point body (openapi.yaml: StartingPointRequest). The service
 * checks it against the cycle: below its N, and the counter with the sessions already counted
 * must stay below N too.
 */
export class StartingPointDto {
  @IsInt()
  @Min(0)
  @Max(MAX_SESSIONS_PER_CYCLE - 1)
  openingCount!: number;
}
