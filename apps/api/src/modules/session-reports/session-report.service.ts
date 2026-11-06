import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotificationType } from '@kidzzy/shared';
import { AcademyRepository } from '../academies/academy.repository';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../sessions/clock';
import { SessionHeldHooks, type SessionHeldHook } from '../sessions/session-held-hooks';
import type { SessionRow } from '../sessions/session.repository';
import { UserRepository } from '../users/user.repository';
import { SESSION_REPORT_PERMISSION } from './session-report.constants';
import {
  cancelledReport,
  heldReport,
  unmarkedReport,
  type SessionReportText,
} from './session-report.format';
import {
  SessionReportRepository,
  type SessionReportKind,
  type UnmarkedSession,
} from './session-report.repository';

/** The sessions the tick found for one academy, with what the reports need. */
export interface UnmarkedBatch {
  sessions: UnmarkedSession[];
  zone: string;
  now: Date;
}

/**
 * The session reports to the admins (US-29, FR-26): held and cancelled run inside the write's own
 * transaction, through SessionHeldHooks; "not marked yet" is found by the tick. Each report is
 * claimed in the same transaction as its notifications, once per session and kind.
 *
 * A bug in the text does not stop the Held or the Cancel: the text is built first, inside a
 * try/catch, before anything is claimed. That catch does not protect against a database error. If
 * a query fails, Postgres has already aborted the transaction and the next statement fails the
 * whole write; a claim or notify failure rolls the Held or the Cancel back.
 */
@Injectable()
export class SessionReportService implements SessionHeldHook, OnModuleInit {
  private readonly logger = new Logger(SessionReportService.name);

  constructor(
    private readonly hooks: SessionHeldHooks,
    private readonly reports: SessionReportRepository,
    private readonly attendance: AttendanceRepository,
    private readonly users: UserRepository,
    private readonly notifications: NotificationsService,
    private readonly academies: AcademyRepository,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.hooks.register(this);
  }

  /** After the attendance is recorded and the cycles are counted. Later edits do not resend. */
  async afterHeld(session: SessionRow, at: Date): Promise<void> {
    const admins = await this.recipients();
    if (admins.length === 0) return;
    const lines = await this.attendance.findForReport(session.id);
    const text = this.build(session.id, () =>
      heldReport({
        groupName: session.group.name,
        topic: session.topic,
        attendance: lines.map((line) => ({
          status: line.status,
          performanceRating: line.performanceRating,
          studentName: line.student.name,
        })),
      }),
    );
    if (text) await this.deliver(session.id, 'held', text, admins, at);
  }

  /** With the reason, whatever the session's date. */
  async onCancelled(session: SessionRow, reason: string, at: Date): Promise<void> {
    const admins = await this.recipients();
    if (admins.length === 0) return;
    const zone = await this.academies.findTimezone();
    const text = this.build(session.id, () =>
      cancelledReport({
        groupName: session.group.name,
        scheduledAt: session.scheduledAt,
        zone,
        reason,
      }),
    );
    if (text) await this.deliver(session.id, 'cancelled', text, admins, at);
  }

  /** This academy's sessions that ended 2 hours ago and are still Scheduled. The job reports each. */
  async listUnmarked(): Promise<UnmarkedBatch> {
    const now = this.clock.now();
    const zone = await this.academies.findTimezone();
    return { sessions: await this.reports.findUnmarked(now), zone, now };
  }

  /** One session per transaction, so a failing one does not hold back the others. */
  @Transactional()
  async reportUnmarked(session: UnmarkedSession, zone: string, now: Date): Promise<boolean> {
    const admins = await this.recipients();
    if (admins.length === 0) return false;
    const text = this.build(session.id, () =>
      unmarkedReport({
        groupName: session.groupName,
        scheduledAt: session.scheduledAt,
        zone,
        instructorName: session.instructorName,
      }),
    );
    if (!text) return false;
    return this.deliver(session.id, 'unmarked', text, admins, now);
  }

  private recipients(): Promise<{ id: string }[]> {
    return this.users.listActiveWithPermission(SESSION_REPORT_PERMISSION);
  }

  /** Runs the pure text builder. On a bug, logs the session id only and gives nothing back. */
  private build(sessionId: string, make: () => SessionReportText): SessionReportText | undefined {
    try {
      return make();
    } catch {
      this.logger.error(`Session report failed for session ${sessionId}`);
      return undefined;
    }
  }

  /** Claims first. A duplicate (already reported) sends nothing and is not an error. */
  private async deliver(
    sessionId: string,
    kind: SessionReportKind,
    text: SessionReportText,
    admins: { id: string }[],
    at: Date,
  ): Promise<boolean> {
    if (!(await this.reports.claim({ sessionId, kind, sentAt: at }))) return false;
    for (const admin of admins) {
      await this.notifications.notify(admin.id, {
        type: NotificationType.SessionReport,
        title: text.title,
        body: text.body,
        data: { url: `/sessions/${sessionId}`, sessionId },
      });
    }
    return true;
  }
}
