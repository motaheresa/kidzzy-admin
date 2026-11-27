import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { TrimToNull } from '../../../common/validation/transforms';

/** GET /announcements/audience/users query: one page of the active users, optionally searched. */
export class ListAudienceUsersQueryDto extends PageQueryDto {
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(100)
  search?: string | null;
}
