import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';

/** GET /audit-logs query (openapi.yaml: listAuditLogs). `from` is inclusive, `to` exclusive. */
export class ListAuditLogsQueryDto extends PageQueryDto {
  /** The kind of record, for example sessions or payment_cycles. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  /** The user who made the change. */
  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** ISO 8601, UTC. */
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  /** ISO 8601, UTC. Must be after `from` when both are set. */
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}
