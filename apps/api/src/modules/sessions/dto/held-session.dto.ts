import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/validation/transforms';
// A pure validation class (no module, no service): the Held body and PUT attendance share the
// same record rules, so the rules live once, in the attendance DTO.
import {
  AttendanceRecordDto,
  MAX_ATTENDANCE_RECORDS,
} from '../../attendance/dto/save-attendance.dto';

export const MAX_TOPIC = 300;

/**
 * POST /sessions/{id}/held body (openapi.yaml: HeldRequest). The topic is what was taught; the
 * attendance is every student of the session, once each. An empty list is valid for a session
 * that has no students; whether the list is complete is checked against the roster in the
 * transaction.
 */
export class HeldSessionDto {
  /** Stored trimmed. A blank topic is refused, the same rule as the database check. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TOPIC)
  topic!: string;

  @IsArray()
  @ArrayMaxSize(MAX_ATTENDANCE_RECORDS)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  attendance!: AttendanceRecordDto[];
}
