import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotificationType } from '@kidzzy/shared';
import { DateTime } from 'luxon';
import { AcademyRepository } from '../academies/academy.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from './clock';
import { matchingLead, type SessionReminderLead } from './session-reminder.constants';
import { SessionReminderRepository, type DueSession } from './session-reminder.repository';

/** One session and the lead the job is about to send. */
export interface DueReminder extends DueSession {
  lead: SessionReminderLead;
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
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** The due leads for this academy, soonest first. The job calls sendOne for each. */
  async listDue(): Promise<DueReminder[]> {
    const now = this.clock.now();
    const zone = await this.academies.findTimezone();
    const due = await this.reminders.findDue(now);
    const reminders: DueReminder[] = [];
    for (const session of due) {
      const lead = matchingLead(session.scheduledAt, now);
      if (lead) reminders.push({ ...session, lead, zone, now });
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
    await this.notifications.notify(reminder.instructorId, {
      type: NotificationType.SessionReminder,
      title: reminder.lead === 1440 ? 'تذكير: عندك حصة' : 'تذكير: حصتك قربت',
      body:
        reminder.lead === 1440
          ? `جروب ${reminder.groupName} ${formatWeekday(reminder.scheduledAt, reminder.zone)} الساعة ${time}`
          : `جروب ${reminder.groupName} الساعة ${time}`,
      data: { url: `/sessions/${reminder.id}`, sessionId: reminder.id },
    });
    return true;
  }
}

/** Arabic weekday only. The clock is formatted separately so the digits stay Western. */
function formatWeekday(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).setLocale('ar').toFormat('cccc');
}

/** 12-hour clock with ص/م and Western digits, for example "3:30 م". */
function formatClock(instant: Date, zone: string): string {
  const local = DateTime.fromJSDate(instant, { zone });
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12;
  const minute = String(local.minute).padStart(2, '0');
  return `${hour12}:${minute} ${local.hour < 12 ? 'ص' : 'م'}`;
}
