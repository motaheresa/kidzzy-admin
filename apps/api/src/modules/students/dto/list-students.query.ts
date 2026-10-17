import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { ToBoolean, Trim } from '../../../common/validation/transforms';

/** GET /students query (openapi.yaml: listStudents). */
export class ListStudentsQueryDto extends PageQueryDto {
  /**
   * Part of the name (in its search form: Arabic letter forms, diacritics and case do not
   * matter) or part of the code; an exact code comes first (US-06). Empty means no search.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Students currently enrolled in this group. */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
