import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /instructors/{id}/reset-password body (openapi.yaml: ResetPasswordRequest). */
export class ResetPasswordDto {
  // The upper limit stops very long inputs from making the hash slow on purpose.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword!: string;
}
