import { Transform } from 'class-transformer';
import { AudienceDto } from './audience.dto';

/**
 * GET /announcements/recipients-count query. userIds comes as one comma-separated value
 * (openapi.yaml: style form, explode false); a repeated key works too. Either way it becomes the
 * same list the send body has, and the same rules check it.
 */
export class RecipientsCountQueryDto extends AudienceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  declare userIds?: string[];
}
