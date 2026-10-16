import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsPhone } from '../../../common/validation/is-phone';
import { Trim } from '../../../common/validation/transforms';

/**
 * PATCH /instructors/{id} body (openapi.yaml: InstructorUpdate). Every field is optional;
 * null removes the email or the phone, as long as one of them remains (checked by the service,
 * which knows the current values).
 */
export class UpdateInstructorDto {
  // ValidateIf, not IsOptional: IsOptional would also let null through, and a name is required.
  @ValidateIf((dto: UpdateInstructorDto) => dto.name !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @Trim()
  @IsPhone()
  phone?: string | null;
}
