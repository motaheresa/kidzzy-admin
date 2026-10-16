import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /auth/change-password body (openapi.yaml: ChangePasswordRequest). */
export class ChangePasswordDto {
  // Any current password, as login accepts it (up to 200 characters).
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword!: string;

  // The upper limit stops very long inputs from making the hash slow on purpose.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
