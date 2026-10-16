import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsPhone } from '../../../common/validation/is-phone';
import { Trim } from '../../../common/validation/transforms';

/** Message on both fields when neither was given (the same rule as the database check). */
export const EMAIL_OR_PHONE = 'Give an email or a phone';

/**
 * POST /instructors body (openapi.yaml: InstructorCreate). At least one of email or phone.
 *
 * ValidateIf runs a field's checks when the field was sent, or when the other one is missing
 * too; so with neither, both fields get an error, and with one of them the other is skipped.
 */
export class CreateInstructorDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ValidateIf((dto: CreateInstructorDto) => dto.email !== undefined || dto.phone === undefined)
  @Trim()
  @IsNotEmpty({ message: EMAIL_OR_PHONE })
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ValidateIf((dto: CreateInstructorDto) => dto.phone !== undefined || dto.email === undefined)
  @Trim()
  @IsNotEmpty({ message: EMAIL_OR_PHONE })
  @IsPhone()
  phone?: string;

  // The upper limit stops very long inputs from making the hash slow on purpose.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword!: string;
}
