import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  ErrorCode,
  REMINDER_RULES_PER_TYPE,
  ReminderRuleType,
  type ReminderRule,
} from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AuditService } from '../audit/audit.service';
import type { CreateReminderRuleDto, UpdateReminderRuleDto } from './dto/reminder-rule.dto';
import { toReminderRule } from './reminder-rule.mapper';
import { ReminderRuleRepository, type ReminderRuleRow } from './reminder-rule.repository';

const ENTITY = 'reminder_rules';

/**
 * Manage reminder rules (US-30, FR-24). The jobs read the active rules every time they run and
 * every reminder they send is claimed, so a change only touches reminders not sent yet: a
 * disabled or deleted rule stops future sends, and a rule edited to a new value can send at the
 * new value (a different claim key) even if the old value was already sent.
 */
@Injectable()
export class ReminderRuleService {
  constructor(
    private readonly rules: ReminderRuleRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ReminderRule[]> {
    return (await this.rules.list()).map(toReminderRule);
  }

  @Transactional()
  async create(dto: CreateReminderRuleDto): Promise<ReminderRule> {
    const isSession = dto.type === ReminderRuleType.SessionReminder;
    // The DTO checked the field that fits the type; the other one must not be sent.
    if (isSession && dto.sessionsBeforeEnd !== undefined) {
      throw wrongField('sessionsBeforeEnd', 'A session rule has leadMinutes');
    }
    if (!isSession && dto.leadMinutes !== undefined) {
      throw wrongField('leadMinutes', 'A payment rule has sessionsBeforeEnd');
    }
    await this.rules.lockAcademy();
    if ((await this.rules.countByType(dto.type)) >= REMINDER_RULES_PER_TYPE) {
      throw new AppException(
        ErrorCode.ReminderRulesLimit,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `At most ${REMINDER_RULES_PER_TYPE} rules per type`,
      );
    }
    const created = await this.rules.create({
      type: dto.type,
      leadMinutes: isSession ? (dto.leadMinutes ?? null) : null,
      sessionsBeforeEnd: isSession ? null : (dto.sessionsBeforeEnd ?? null),
    });
    await this.audit.record({
      action: 'reminder_rule.created',
      entityType: ENTITY,
      entityId: created.id,
      after: auditValues(created),
    });
    return toReminderRule(created);
  }

  @Transactional()
  async update(id: string, dto: UpdateReminderRuleDto): Promise<ReminderRule> {
    const current = await this.find(id);
    const isSession = current.type === ReminderRuleType.SessionReminder;
    if (isSession && dto.sessionsBeforeEnd !== undefined) {
      throw wrongField('sessionsBeforeEnd', 'A session rule has leadMinutes');
    }
    if (!isSession && dto.leadMinutes !== undefined) {
      throw wrongField('leadMinutes', 'A payment rule has sessionsBeforeEnd');
    }
    const changes = {
      ...(dto.leadMinutes !== undefined && dto.leadMinutes !== current.leadMinutes
        ? { leadMinutes: dto.leadMinutes }
        : {}),
      ...(dto.sessionsBeforeEnd !== undefined && dto.sessionsBeforeEnd !== current.sessionsBeforeEnd
        ? { sessionsBeforeEnd: dto.sessionsBeforeEnd }
        : {}),
      ...(dto.isActive !== undefined && dto.isActive !== current.isActive
        ? { isActive: dto.isActive }
        : {}),
    };
    if (Object.keys(changes).length === 0) return toReminderRule(current);
    const updated = await this.rules.update(id, changes);
    await this.audit.record({
      action: 'reminder_rule.changed',
      entityType: ENTITY,
      entityId: id,
      before: auditValues(current),
      after: auditValues(updated),
    });
    return toReminderRule(updated);
  }

  @Transactional()
  async remove(id: string): Promise<void> {
    const current = await this.find(id);
    await this.rules.delete(id);
    await this.audit.record({
      action: 'reminder_rule.deleted',
      entityType: ENTITY,
      entityId: id,
      before: auditValues(current),
    });
  }

  private async find(id: string): Promise<ReminderRuleRow> {
    const rule = await this.rules.findById(id); // null for another academy's rule → 404
    if (!rule) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND);
    return rule;
  }
}

/** 422: the value contradicts the rule's type (the shape itself was valid). */
function wrongField(field: string, message: string): AppException {
  return new AppException(ErrorCode.ValidationFailed, HttpStatus.UNPROCESSABLE_ENTITY, message, [
    { field, message },
  ]);
}

function auditValues(row: ReminderRuleRow): Record<string, string | number | boolean | null> {
  return {
    type: row.type,
    leadMinutes: row.leadMinutes,
    sessionsBeforeEnd: row.sessionsBeforeEnd,
    isActive: row.isActive,
  };
}
