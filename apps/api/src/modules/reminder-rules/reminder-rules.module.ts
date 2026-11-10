import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReminderRuleRepository } from './reminder-rule.repository';
import { ReminderRuleService } from './reminder-rule.service';
import { ReminderRulesController } from './reminder-rules.controller';

/**
 * Reminder rules (US-30): when the academy wants session and payment reminders. The sessions and
 * payments modules read the active rules through the exported repository.
 */
@Module({
  imports: [AuditModule],
  controllers: [ReminderRulesController],
  providers: [ReminderRuleRepository, ReminderRuleService],
  exports: [ReminderRuleRepository],
})
export class ReminderRulesModule {}
