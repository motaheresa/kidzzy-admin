import { IsBoolean, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../../common/validation/transforms';

/**
 * PATCH /groups/{id} body (openapi.yaml: GroupUpdate). Only the fields sent change. Each uses
 * ValidateIf (sent means checked), so null is refused. instructorId needs scope `any`: the
 * service answers 403 to an instructor who sends it.
 */
export class UpdateGroupDto {
  @ValidateIf((dto: UpdateGroupDto) => dto.name !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ValidateIf((dto: UpdateGroupDto) => dto.level !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  level?: string;

  @ValidateIf((dto: UpdateGroupDto) => dto.instructorId !== undefined)
  @IsUUID()
  instructorId?: string;

  @ValidateIf((dto: UpdateGroupDto) => dto.isActive !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
