import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/validation/transforms';

export const MAX_CANCEL_REASON = 500;

/** POST /sessions/{id}/cancel body (openapi.yaml: CancelRequest). */
export class CancelSessionDto {
  /** Stored trimmed. A blank reason is refused, the same rule as the database check. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CANCEL_REASON)
  reason!: string;
}
