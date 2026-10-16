import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { STUDENT_CODE_PATTERN } from '../../../common/normalize/student-code';
import { IsPhone } from '../../../common/validation/is-phone';
import { Trim } from '../../../common/validation/transforms';
import { MAX_AGE, MIN_AGE } from './create-student.dto';

/**
 * PATCH /students/{id} body (openapi.yaml: StudentUpdate). Only the fields sent change.
 * Required fields use ValidateIf (sent means checked, so null is refused); age and notes use
 * IsOptional, so null clears them.
 */
export class UpdateStudentDto {
  @ValidateIf((dto: UpdateStudentDto) => dto.code !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(STUDENT_CODE_PATTERN, { message: 'code may only have letters, digits and . _ / -' })
  code?: string;

  @ValidateIf((dto: UpdateStudentDto) => dto.name !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_AGE)
  @Max(MAX_AGE)
  age?: number | null;

  @ValidateIf((dto: UpdateStudentDto) => dto.parentName !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  parentName?: string;

  @ValidateIf((dto: UpdateStudentDto) => dto.parentPhone !== undefined)
  @Trim()
  @IsPhone()
  parentPhone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
