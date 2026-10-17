import { IsInt, Matches, Max, Min } from 'class-validator';
import { MAX_DURATION, MIN_DURATION, START_TIME_PATTERN } from '../schedule';

/** One weekly meeting (openapi.yaml: ScheduleSlot). */
export class ScheduleSlotDto {
  /** 0 = Sunday … 6 = Saturday */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  /** Academy-local, "HH:MM" */
  @Matches(START_TIME_PATTERN, { message: 'startTime must be HH:MM, from 00:00 to 23:59' })
  startTime!: string;

  @IsInt()
  @Min(MIN_DURATION)
  @Max(MAX_DURATION)
  durationMin!: number;
}
