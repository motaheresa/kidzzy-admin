import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { MAX_SLOTS } from '../schedule';
import { ScheduleSlotDto } from './schedule-slot.dto';

/** PUT /groups/{id}/schedule body (openapi.yaml: ScheduleReplace). At least one slot. */
export class ReplaceScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule!: ScheduleSlotDto[];
}
