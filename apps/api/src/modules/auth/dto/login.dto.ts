import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /auth/login body (openapi.yaml: LoginRequest). */
export class LoginDto {
  /** Email or phone */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  login!: string;

  // The upper limit stops very long inputs from making the hash slow on purpose.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
