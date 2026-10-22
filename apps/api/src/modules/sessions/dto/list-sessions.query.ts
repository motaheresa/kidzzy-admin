import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { SessionStatus } from '@kidzzy/shared';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';

const STATUSES = [SessionStatus.Scheduled, SessionStatus.Held, SessionStatus.Cancelled] as const;

/** GET /sessions query (openapi.yaml: listSessions). `from` is inclusive, `to` exclusive. */
export class ListSessionsQueryDto extends PageQueryDto {
  /** ISO 8601, UTC. */
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  /** ISO 8601, UTC. Must be after `from` when both are set. */
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  /**
   * Scope `any`: returns exactly the sessions this instructor would see (they teach the group
   * now, or they are the instructor on the session). Scope `own`: must be the caller.
   */
  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: SessionStatus;

  /** The only sort the API offers. Omitted means the same order. */
  @IsOptional()
  @IsIn(['scheduledAt'])
  sort?: 'scheduledAt';
}
