import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STUDENT_CODE_PATTERN } from '../../../common/normalize/student-code';
import { IsPhone } from '../../../common/validation/is-phone';
import { Trim } from '../../../common/validation/transforms';

export const MIN_AGE = 3;
export const MAX_AGE = 25;

/** POST /students body (openapi.yaml: StudentCreate). */
export class CreateStudentDto {
  /** Stored trimmed and uppercase (KC-001). */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(STUDENT_CODE_PATTERN, { message: 'code may only have letters, digits and . _ / -' })
  code!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_AGE)
  @Max(MAX_AGE)
  age?: number;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  parentName!: string;

  @Trim()
  @IsPhone()
  parentPhone!: string;

  /** Empty after trimming means no notes. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
