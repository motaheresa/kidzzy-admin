import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import {
  REMINDER_LEAD_MINUTES_MAX,
  REMINDER_LEAD_MINUTES_MIN,
  REMINDER_SESSIONS_BEFORE_END_MAX,
  REMINDER_SESSIONS_BEFORE_END_MIN,
  ReminderRuleType,
} from '@kidzzy/shared';

/**
 * POST /reminder-rules body (openapi.yaml: ReminderRuleCreate). A session rule needs leadMinutes
 * and a payment rule needs sessionsBeforeEnd; the field that does not belong to the type is
 * refused by the service.
 */
export class CreateReminderRuleDto {
  @IsIn(Object.values(ReminderRuleType))
  type!: ReminderRuleType;

  @ValidateIf((rule: CreateReminderRuleDto) => rule.type === ReminderRuleType.SessionReminder)
  @IsInt()
  @Min(REMINDER_LEAD_MINUTES_MIN)
  @Max(REMINDER_LEAD_MINUTES_MAX)
  leadMinutes?: number;

  @ValidateIf((rule: CreateReminderRuleDto) => rule.type !== ReminderRuleType.SessionReminder)
  @IsInt()
  @Min(REMINDER_SESSIONS_BEFORE_END_MIN)
  @Max(REMINDER_SESSIONS_BEFORE_END_MAX)
  sessionsBeforeEnd?: number;
}

/**
 * PATCH /reminder-rules/{id} body (openapi.yaml: ReminderRuleUpdate). There is no `type`: it
 * cannot change, and the global pipe rejects it as an unknown property. Which value field fits
 * depends on the rule's type, so the service checks that.
 */
export class UpdateReminderRuleDto {
  @IsOptional()
  @IsInt()
  @Min(REMINDER_LEAD_MINUTES_MIN)
  @Max(REMINDER_LEAD_MINUTES_MAX)
  leadMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(REMINDER_SESSIONS_BEFORE_END_MIN)
  @Max(REMINDER_SESSIONS_BEFORE_END_MAX)
  sessionsBeforeEnd?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
