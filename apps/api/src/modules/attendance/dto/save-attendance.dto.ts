import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '@kidzzy/shared';

export const MAX_ATTENDANCE_RECORDS = 200;
const STATUSES = [AttendanceStatus.Present, AttendanceStatus.Absent] as const;

/**
 * One student's line (openapi.yaml: AttendanceRecord). A rating left out or null is saved as
 * null; homeworkRating null means there was no homework.
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
