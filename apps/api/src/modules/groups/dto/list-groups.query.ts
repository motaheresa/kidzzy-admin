import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { ToBoolean, Trim } from '../../../common/validation/transforms';

/** GET /groups query (openapi.yaml: listGroups). */
export class ListGroupsQueryDto extends PageQueryDto {
  /** Part of the name or the level, in its search form (Arabic letter forms and case ignored). */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
