import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../../common/validation/transforms';
import { CLOCK_TIME_PATTERN } from '../actual-times';
import { MAX_TOPIC } from './held-session.dto';

/**
 * PATCH /sessions/{id} body (openapi.yaml: SessionUpdate). A Held session's topic can be
 * corrected, and so can its actual start and end (SCRUM-80). The body has the topic, or both
 * times together, or all three. One time alone is refused here (each needs the other); an empty
 * body is refused by the service.
 */
export class UpdateSessionDto {
  /** Stored trimmed. A blank topic is refused, the same rule as the database check. */
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TOPIC)
  topic?: string;

  /** "HH:mm" in the academy's zone, on the session's date. Sent together with endedAt. */
  @ValidateIf(
    (body: UpdateSessionDto) => body.startedAt !== undefined || body.endedAt !== undefined,
  )
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  startedAt?: string;

  /** "HH:mm"; on the next date when it is earlier than startedAt. Not after now. */
  @ValidateIf(
    (body: UpdateSessionDto) => body.startedAt !== undefined || body.endedAt !== undefined,
  )
  @IsString()
  @Matches(CLOCK_TIME_PATTERN)
  endedAt?: string;
}
