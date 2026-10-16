import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { ToBoolean } from '../../../common/validation/transforms';

/**
 * GET /students query (openapi.yaml: listStudents).
 * TODO(SCRUM-19, US-06): `search` (name or code). Until then it is an unknown property, so a
 * request that sends it gets 400 instead of a list that silently ignores it.
 */
export class ListStudentsQueryDto extends PageQueryDto {
  /** Students currently enrolled in this group. */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
