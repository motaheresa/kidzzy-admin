import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '@kidzzy/shared';
import { TrimToNull } from '../../../common/validation/transforms';

export const MAX_ATTENDANCE_RECORDS = 200;
export const MAX_ATTENDANCE_NOTE = 500;
const STATUSES = [AttendanceStatus.Present, AttendanceStatus.Absent] as const;

/**
 * One student's line (openapi.yaml: AttendanceRecord). A rating left out or null is saved as
 * null; homeworkRating null means there was no homework. A note is stored trimmed, a blank one is
 * null, and a record sent without a note clears the one saved before.
 */
export class AttendanceRecordDto {
  @IsUUID()
  studentId!: string;

  @IsIn(STATUSES)
  status!: AttendanceStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  performanceRating?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  homeworkRating?: number | null;

  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(MAX_ATTENDANCE_NOTE)
  note?: string | null;
}

/** PUT /sessions/{id}/attendance body (openapi.yaml: AttendanceSave). At least one record. */
export class SaveAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ATTENDANCE_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}
