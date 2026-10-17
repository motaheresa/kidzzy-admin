import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';
import { Trim } from '../../../common/validation/transforms';
import { MAX_SLOTS } from '../schedule';
import { ScheduleSlotDto } from './schedule-slot.dto';

/** POST /groups body (openapi.yaml: GroupCreate). At least one slot. */
export class CreateGroupDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** Course or level, e.g. Scratch 1 */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  level!: string;

  @IsUUID()
  instructorId!: string;

  /** Academy-local date, YYYY-MM-DD */
  @IsCalendarDate()
  startDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule!: ScheduleSlotDto[];
}
