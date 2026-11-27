import { ANNOUNCEMENT_MAX_USERS, AnnouncementAudience } from '@kidzzy/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
  ValidateIf,
} from 'class-validator';

/**
 * Who an announcement goes to, shared by the send body and the recipients count. roleId is read
 * only for the role audience and userIds only for the users audience.
 */
export class AudienceDto {
  @IsIn(Object.values(AnnouncementAudience))
  audience!: AnnouncementAudience;

  @ValidateIf((dto: AudienceDto) => dto.audience === 'role')
  @IsUUID()
  roleId?: string;

  @ValidateIf((dto: AudienceDto) => dto.audience === 'users')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ANNOUNCEMENT_MAX_USERS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  userIds?: string[];
}
