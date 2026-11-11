import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotificationType } from '@kidzzy/shared';
import { AcademyRepository } from '../academies/academy.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { ReminderRuleRepository } from '../reminder-rules/reminder-rule.repository';
import { Clock } from './clock';
import { DAY_MINUTES, matchingLeads } from './session-reminder.constants';
import { SessionReminderRepository, type DueSession } from './session-reminder.repository';
import { formatClock, formatWeekday } from './session-time-format';

/** One session and the lead the job is about to send. */
export interface DueReminder extends DueSession {
  lead: number;
  zone: string;
  now: Date;
}

/**
 * Session reminders (US-26). Computed when the job runs, from the session as it is then, so a
 * reschedule, a cancel or an instructor change is already reflected. notify joins the transaction
 * that claimed the lead.
 */
@Injectable()
export class SessionReminderService {
  constructor(
    private readonly reminders: SessionReminderRepository,
    private readonly academies: AcademyRepository,
    private readonly rules: ReminderRuleRepository,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /**
   * The due leads for this academy, soonest first. The job calls sendOne for each. The leads are
   * the academy's active session rules (SCRUM-47), read now: a rule turned off or deleted stops
   * future sends, and a lead already sent is never listed again. With no active rule nothing is
   * due and no session is read.
   */
  async listDue(): Promise<DueReminder[]> {
    const leads = await this.rules.activeLeadMinutes();
    if (leads.length === 0) return [];
    const now = this.clock.now();
    const zone = await this.academies.findTimezone();
    const due = await this.reminders.findDue(now, leads);
    const reminders: DueReminder[] = [];
    for (const session of due) {
      for (const lead of matchingLeads(session.scheduledAt, now, leads)) {
        if (!session.sentLeads.includes(lead)) reminders.push({ ...session, lead, zone, now });
      }
    }
    return reminders;
  }

  /**
   * Claims the lead first. A duplicate (the other run won) returns without notify, so it is not
   * an error and the rest of the batch continues. notify writes the notification and its push
   * job in this same transaction.
   */
  @Transactional()
  async sendOne(reminder: DueReminder): Promise<boolean> {
    const claimed = await this.reminders.claim({
      sessionId: reminder.id,
      leadMinutes: reminder.lead,
      instructorId: reminder.instructorId,
      sentAt: reminder.now,
    });
    if (!claimed) return false;
    const time = formatClock(reminder.scheduledAt, reminder.zone);
    // A day or more ahead names the weekday; a closer lead only needs the time.
    const farAhead = reminder.lead >= DAY_MINUTES;
    await this.notifications.notify(reminder.instructorId, {
      type: NotificationType.SessionReminder,
      title: farAhead ? 'تذكير: عندك حصة' : 'تذكير: حصتك قربت',
      body: farAhead
        ? `جروب ${reminder.groupName} ${formatWeekday(reminder.scheduledAt, reminder.zone)} الساعة ${time}`
        : `جروب ${reminder.groupName} الساعة ${time}`,
      data: { url: `/sessions/${reminder.id}`, sessionId: reminder.id },
    });
    return true;
  }
}
