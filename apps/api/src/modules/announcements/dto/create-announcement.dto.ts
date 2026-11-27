import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '@kidzzy/shared';
import { TextLength } from '../../../common/validation/text-length';
import { Trim } from '../../../common/validation/transforms';
import { AudienceDto } from './audience.dto';

/** POST /announcements body (openapi.yaml: AnnouncementCreate). Lengths are after trimming. */
export class CreateAnnouncementDto extends AudienceDto {
  @Trim()
  @TextLength(1, ANNOUNCEMENT_TITLE_MAX)
  title!: string;

  @Trim()
  @TextLength(1, ANNOUNCEMENT_BODY_MAX)
  body!: string;
}
