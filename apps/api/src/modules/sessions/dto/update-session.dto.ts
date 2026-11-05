import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/validation/transforms';
import { MAX_TOPIC } from './held-session.dto';

/** PATCH /sessions/{id} body (openapi.yaml: SessionUpdate). Only the topic can be corrected. */
export class UpdateSessionDto {
  /** Stored trimmed. A blank topic is refused, the same rule as the database check. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TOPIC)
  topic!: string;
}
