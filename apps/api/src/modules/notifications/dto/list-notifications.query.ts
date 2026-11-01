import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { ToBoolean } from '../../../common/validation/transforms';

/** GET /notifications query. unread=true keeps only the ones with no readAt. */
export class ListNotificationsQueryDto extends PageQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unread?: boolean;
}
