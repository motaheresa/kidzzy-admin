import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { ToBoolean, Trim } from '../../../common/validation/transforms';

/** GET /instructors query (openapi.yaml: listInstructors). */
export class ListInstructorsQueryDto extends PageQueryDto {
  /** Part of the name, email or phone. Empty means no search. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
