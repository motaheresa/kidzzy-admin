import { Injectable, Logger } from '@nestjs/common';
import type { CycleChange } from '@kidzzy/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../sessions/clock';
import type { SessionRow } from '../sessions/session.repository';
import { StudentRepository } from '../students/student.repository';
import { UserRepository } from '../users/user.repository';
import { PAYMENT_REMINDER_PERMISSION } from './payment-reminder.constants';
import {
  formatSummary,
  reminderCandidates,
  type ReminderCandidate,
} from './payment-reminder.format';
import { PaymentReminderRepository } from './payment-reminder.repository';

/**
 * One summary for the admins when a Held session moves cycles onto a reminder threshold
 * (US-27). Called from cycle counting, inside the Held transaction. A bug in the text does not
 * stop the session being marked Held; a database error in the claim or notify does, because
 * that error already aborts the transaction.
 */
@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    private readonly reminders: PaymentReminderRepository,
    private readonly students: StudentRepository,
    private readonly users: UserRepository,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  async remind(session: SessionRow, changes: CycleChange[]): Promise<void> {
    const candidates = reminderCandidates(changes);
    if (candidates.length === 0) return;
    const admins = await this.users.listActiveWithPermission(PAYMENT_REMINDER_PERMISSION);
    if (admins.length === 0) return;

    const studentIds = [
      ...new Set(
        candidates.flatMap((candidate) => (candidate.studentId ? [candidate.studentId] : [])),
      ),
    ];
    let names: Map<string, string>;
    try {
      const rows = await this.students.findNames(studentIds);
      names = new Map(rows.map((row) => [row.id, row.name]));
      // Preflight on every candidate, before any claim. The same function runs again on whoever
      // was actually claimed, which is a subset of this data.
      formatSummary(namesOf(session), candidates, names);
    } catch {
      // The session id only. This catch does not protect against a database failure: if the name
      // query fails, Postgres has already aborted the transaction, and the next statement fails
      // the Held mark too. A plain error (a missing name, a formatting bug) is skipped here, so
      // the session stays Held and no threshold is consumed.
      this.logger.error(`Payment reminder failed for session ${session.id}`);
      return;
    }

    const claimed: ReminderCandidate[] = [];
    for (const candidate of candidates) {
      const taken = await this.reminders.claim({
        cycleId: candidate.cycleId,
        sessionsLeft: candidate.sessionsLeft,
        sentAt: this.clock.now(),
      });
      if (taken) claimed.push(candidate);
    }
    if (claimed.length === 0) return;

    const summary = formatSummary(namesOf(session), claimed, names);
    for (const admin of admins) {
      await this.notifications.notify(admin.id, {
        type: summary.type,
        title: summary.title,
        body: summary.body,
        data: { url: summary.url, sessionId: session.id, groupId: session.group.id },
      });
    }
  }
}

function namesOf(session: SessionRow): { groupName: string; instructorName: string } {
  return { groupName: session.group.name, instructorName: session.instructor.name };
}
