import type { ReminderRule } from '@kidzzy/shared';
import type { ReminderRuleRow } from './reminder-rule.repository';

export function toReminderRule(row: ReminderRuleRow): ReminderRule {
  return {
    id: row.id,
    type: row.type,
    leadMinutes: row.leadMinutes,
    sessionsBeforeEnd: row.sessionsBeforeEnd,
    isActive: row.isActive,
  };
}
