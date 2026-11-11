import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type HeldResult, type Page, type Session } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AcademyRepository } from '../academies/academy.repository';
import { AccessContext } from '../auth/access-context';
import { AuditService } from '../audit/audit.service';
import { ActualTimeError, actualInstants } from './actual-times';
import { Clock } from './clock';
import type { CreateSessionDto } from './dto/create-session.dto';
import type { HeldSessionDto } from './dto/held-session.dto';
import type { ListSessionsQueryDto } from './dto/list-sessions.query';
import type { RescheduleSessionDto } from './dto/reschedule-session.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';
import { toSession } from './session.mapper';
import { SessionHeldHooks } from './session-held-hooks';
import { SessionRepository, type SessionRow } from './session.repository';
import { isVisibleToInstructor } from './session-visibility';

/**
 * Reading sessions (US-12).
 *
 * Scope `any` (the admin) sees every session of the academy. Passing instructorId=X returns
 * exactly the sessions X would see under scope `own`.
 *
 * Scope `own` (an instructor) sees a session when EITHER they are the group's current instructor
 * (`groups.instructor_id`) OR they are the instructor on the session (`sessions.instructor_id`,
 * who taught it or who will teach it). After an admin changes a group's instructor, the old
 * instructor still sees the sessions they taught, and the new instructor sees the group's whole
 * history because they are the current instructor.
 *
 * With groupId, an unknown group is 404 for every scope. Scope `own` is 403 only when the caller
 * is neither the current instructor nor the instructor on any session of that group; otherwise
 * the same OR filter applies, so an old instructor gets only the sessions they taught there.
 * instructorId under scope `own` must be the caller (403 otherwise).
 *
 * Another academy's row is never found (404). The response's instructorId is the session's own
 * instructor, which can differ from the group's current one.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly access: AccessContext,
    private readonly clock: Clock,
    private readonly heldHooks: SessionHeldHooks,
    private readonly audit: AuditService,
    private readonly academies: AcademyRepository,
  ) {}

  async list(query: ListSessionsQueryDto): Promise<Page<Session>> {
    this.assertRange(query);
    const scope = this.access.scopeFor('sessions.read');
    if (scope === 'own' && query.instructorId && query.instructorId !== this.access.userId) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
    }
    if (query.groupId) {
      const group = await this.sessions.findGroup(query.groupId);
      if (!group) {
        throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
      }
      if (scope === 'own' && !(await this.canSeeGroup(query.groupId, group.instructorId))) {
        throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
      }
    }

    const { rows, total } = await this.sessions.list(
      {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        groupId: query.groupId,
        visibleToInstructorId: scope === 'own' ? this.access.userId : query.instructorId,
        status: query.status,
        isMakeup: query.isMakeup,
      },
      pageWindow(query),
    );
    return toPage(rows.map(toSession), query, total);
  }

  async get(id: string): Promise<Session> {
    const row = await this.sessions.findById(id);
    if (!row) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    if (!this.canSeeSession(row)) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
    }
    return toSession(row);
  }

  /** Scope `own` may open the group when they teach it now or they are on one of its sessions. */
  private async canSeeGroup(groupId: string, currentInstructorId: string): Promise<boolean> {
    if (this.access.scopeFor('sessions.read') !== 'own') return true;
    const caller = this.access.userId;
    return (
      currentInstructorId === caller || (await this.sessions.instructorHasSession(groupId, caller))
    );
  }

  /** Scope `own` may read the session when they teach the group now or they are its instructor. */
  private canSeeSession(row: SessionRow): boolean {
    if (this.access.scopeFor('sessions.read') !== 'own') return true;
    return isVisibleToInstructor(row, this.access.userId);
  }

  /**
   * Marks a Scheduled session Held (US-13) and gives it the next number in its group.
   *
   * Writing is stricter than reading. Scope `own` may mark Held only when `sessions.instructor_id`
   * is the caller, not merely because they are the group's current instructor. After an instructor
   * change, an unrecorded session stays on the previous instructor: the new one is 403 on it.
   * Scope `any` (the admin) may mark any session of the academy.
   *
   * The group row is locked for the rest of the transaction, so a second mark of the same group
   * waits and then sees this write. Marking Held never renumbers sessions that are already Held.
   * Undo (SCRUM-41, BR-13) is what will renumber later.
   *
   * The topic and the attendance of every student come in the same request and are written in the
   * same transaction (SCRUM-79): Held, the number, the topic, the attendance, the cycle counters and
   * the payment reminders are one fact, so a refusal anywhere (a missing student, a rating on an
   * absent one) puts all of it back. The checks run in this order: the session (404, 403, 409 for
   * its state, the clock and the order rule), then the attendance against the session's students.
   *
   * The admin session report (FR-26, SCRUM-43) is written in this same transaction by a hook,
   * after the attendance and the cycles. It uses the topic and the counts only: a student's note is
   * about a child and is never copied into a notification, a push payload or an audit row.
   */
  @Transactional()
  async markHeld(id: string, dto: HeldSessionDto): Promise<HeldResult> {
    const row = await this.loadForWrite(id);

    if (row.status !== 'scheduled') {
      throw new AppException(
        ErrorCode.SessionNotScheduled,
        HttpStatus.CONFLICT,
        'Only a scheduled session can be marked Held',
      );
    }
    const now = this.clock.now();
    if (row.scheduledAt > now) {
      throw new AppException(
        ErrorCode.SessionNotStarted,
        HttpStatus.CONFLICT,
        'The session has not started',
      );
    }
    await this.ensureOrder(row);
    // Before anything is written: a refused time leaves the session Scheduled.
    const actual = await this.actualTimes(row.scheduledAt, dto.startedAt, dto.endedAt, now);

    const sessionNumber = await this.sessions.nextSessionNumber(row.group.id);
    await this.sessions.markHeld(id, sessionNumber, dto.topic, actual, this.access.userId, now);
    const held = await this.sessions.findById(id);
    if (!held) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }

    // The attendance first, as its own step, so a refusal comes before anything is counted.
    await this.heldHooks.recordAttendance(
      held,
      dto.attendance.map((record) => ({
        studentId: record.studentId,
        status: record.status,
        performanceRating: record.performanceRating ?? null,
        homeworkRating: record.homeworkRating ?? null,
        note: record.note ?? null,
      })),
      now,
    );

    // Counts the session into the payment cycles (US-22), in this same transaction.
    const cyclesUpdated = await this.heldHooks.run(held, now);
    // The report to the admins (SCRUM-43), once the attendance and the cycles are written.
    await this.heldHooks.afterRun(held, now);

    // Each counted cycle took exactly this one session, so its counter was one lower before, and
    // only a cycle in progress is counted: the "before" is exact.
    await this.audit.record({
      action: 'session.held',
      entityType: 'sessions',
      entityId: id,
      before: {
        status: 'scheduled',
        sessionNumber: null,
        cycles: cyclesUpdated.map((cycle) => ({
          cycleId: cycle.cycleId,
          sessionsCounted: cycle.sessionsCounted - 1,
          status: 'in_progress',
        })),
      },
      after: {
        status: 'held',
        sessionNumber,
        actualStartedAt: actual.startedAt.toISOString(),
        actualEndedAt: actual.endedAt.toISOString(),
        cycles: cyclesUpdated.map((cycle) => ({
          cycleId: cycle.cycleId,
          sessionsCounted: cycle.sessionsCounted,
          status: cycle.status,
        })),
      },
    });
    return { ...toSession(held), cyclesUpdated };
  }

  /**
   * Returns a Held session to Scheduled (US-17, BR-13), for the admin only, with no time limit.
   * In one transaction, after the group lock: the hooks take the session out of every cycle that
   * counted it (the counters drop, a Due cycle returns to In progress) and delete its attendance,
   * or refuse (a paid cycle, or a cycle after it that already counts sessions: undo the newest
   * first); then the session goes back to Scheduled with no number, the later Held sessions of
   * the group are renumbered, and the change is written to the audit log. If anything refuses,
   * nothing changed. The session can be marked Held again only if no later session of the group
   * is Held (the order rule).
   */
  @Transactional()
  async undoHeld(id: string): Promise<Session> {
    const first = await this.sessions.findById(id);
    if (!first) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    await this.sessions.lockGroup(first.group.id);

    const row = await this.sessions.findById(id);
    if (!row) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    if (row.status !== 'held' || row.sessionNumber === null) {
      throw new AppException(
        ErrorCode.SessionNotHeld,
        HttpStatus.CONFLICT,
        'Only a Held session can be undone',
      );
    }

    await this.heldHooks.undo(row);
    await this.sessions.markScheduled(id, this.access.userId, this.clock.now());
    const renumbered = await this.sessions.renumberAfter(row.group.id, row.sessionNumber);
    await this.audit.record({
      action: 'session.held_undone',
      entityType: 'sessions',
      entityId: id,
      // The topic is cleared with the status, so the log keeps what it was. The notes are about
      // children and are not recorded here.
      before: {
        status: 'held',
        sessionNumber: row.sessionNumber,
        topic: row.topic,
        actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
        actualEndedAt: row.actualEndedAt?.toISOString() ?? null,
      },
      after: {
        status: 'scheduled',
        sessionNumber: null,
        topic: null,
        actualStartedAt: null,
        actualEndedAt: null,
        laterSessionsRenumbered: renumbered,
      },
    });

    const undone = await this.sessions.findById(id);
    if (!undone) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    return toSession(undone);
  }

  /**
   * Corrects a Held session (SCRUM-79, SCRUM-80): what was taught, and when it really started and
   * ended. The body has the topic, or both times, or all three. The same write rule and group lock
   * as marking Held (scope `own`: the instructor on the session; scope `any`: the admin). A
   * session that is not Held is 409 SESSION_NOT_HELD. The times follow the Held rules (422
   * ACTUAL_TIME_INVALID). Each change is audited with its values before and after, and a part
   * that does not change writes nothing.
   */
  @Transactional()
  async update(id: string, dto: UpdateSessionDto): Promise<Session> {
    if (dto.topic === undefined && dto.startedAt === undefined && dto.endedAt === undefined) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'Send the topic or the times',
        [{ field: 'topic', message: 'Send the topic or the times' }],
      );
    }
    const row = await this.loadForWrite(id);
    if (row.status !== 'held') {
      throw new AppException(
        ErrorCode.SessionNotHeld,
        HttpStatus.CONFLICT,
        'The topic and the times are written for a Held session',
      );
    }
    // Checked before anything is written, so a refused time leaves the topic unchanged too.
    const actual =
      dto.startedAt !== undefined && dto.endedAt !== undefined
        ? await this.actualTimes(row.scheduledAt, dto.startedAt, dto.endedAt, this.clock.now())
        : undefined;

    if (dto.topic !== undefined && dto.topic !== row.topic) {
      await this.sessions.setTopic(id, dto.topic);
      await this.audit.record({
        action: 'session.topic_changed',
        entityType: 'sessions',
        entityId: id,
        before: { topic: row.topic },
        after: { topic: dto.topic },
      });
    }
    if (
      actual &&
      (actual.startedAt.getTime() !== row.actualStartedAt?.getTime() ||
        actual.endedAt.getTime() !== row.actualEndedAt?.getTime())
    ) {
      await this.sessions.setActualTimes(id, actual);
      await this.audit.record({
        action: 'session.actual_times_changed',
        entityType: 'sessions',
        entityId: id,
        before: {
          actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
          actualEndedAt: row.actualEndedAt?.toISOString() ?? null,
        },
        after: {
          actualStartedAt: actual.startedAt.toISOString(),
          actualEndedAt: actual.endedAt.toISOString(),
        },
      });
    }

    const updated = await this.sessions.findById(id);
    if (!updated) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    return toSession(updated);
  }

  /**
   * The instants of the start and end an instructor typed as clock times in the academy's zone,
   * on the session's date (see actualInstants). A refused time is 422 ACTUAL_TIME_INVALID, with
   * the field at fault.
   */
  private async actualTimes(
    scheduledAt: Date,
    startedAt: string,
    endedAt: string,
    now: Date,
  ): Promise<{ startedAt: Date; endedAt: Date }> {
    const zone = await this.academies.findTimezone();
    try {
      return actualInstants({ scheduledAt, startedAt, endedAt, zone, now });
    } catch (error) {
      if (!(error instanceof ActualTimeError)) throw error;
      throw new AppException(
        ErrorCode.ActualTimeInvalid,
        HttpStatus.UNPROCESSABLE_ENTITY,
        error.message,
        [{ field: error.field, message: error.message }],
      );
    }
  }

  /**
   * Cancels a Scheduled session with a reason (US-14). A Cancelled session gets no number, and
   * it no longer counts as an earlier Scheduled session, so it unblocks the ones after it.
   * Allowed before or after its start time. Same write scope and group lock as marking Held.
   * A Held session is not cancelled here: that is the admin's undo (SCRUM-41).
   */
  @Transactional()
  async cancel(id: string, reason: string): Promise<Session> {
    const row = await this.loadForWrite(id);
    if (row.status !== 'scheduled') {
      throw new AppException(
        ErrorCode.SessionNotScheduled,
        HttpStatus.CONFLICT,
        'Only a scheduled session can be cancelled',
      );
    }
    await this.sessions.markCancelled(id, reason, this.access.userId, this.clock.now());
    const cancelled = await this.sessions.findById(id);
    if (!cancelled) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    await this.audit.record({
      action: 'session.cancelled',
      entityType: 'sessions',
      entityId: id,
      before: { status: 'scheduled' },
      after: { status: 'cancelled', cancelReason: reason },
    });
    // The report to the admins (SCRUM-43), in this same transaction.
    await this.heldHooks.cancelled(cancelled, reason, this.clock.now());
    return toSession(cancelled);
  }

  /**
   * Adds a make-up or an extra session to a group (US-16, FR-11, BR-04).
   *
   * Scope `any` may add to any group of the academy; scope `own` only to a group they teach now
   * (`groups.instructor_id`), otherwise 403. The group is 404 when unknown (or another academy's)
   * and 409 GROUP_INACTIVE when inactive. The session's instructor is the group's current one.
   * It starts Scheduled with no number, no slot and no occurrence date, so the daily generation
   * and a schedule edit never touch it. It is stored with is_makeup = true; the link
   * `compensatesSessionId` makes it a make-up, and without it it is an extra session.
   *
   * With a link, the target must be a session of THIS group (otherwise 422
   * COMPENSATES_SESSION_INVALID, also for an unknown id or another academy's, because it is a
   * reference in the body and not the URL's resource), Cancelled (409 SESSION_NOT_CANCELLED) and
   * not yet compensated (409 SESSION_ALREADY_COMPENSATED). The checks run under the group lock;
   * the partial unique index sessions_one_makeup_key is the last safety net.
   *
   * The time is not checked (the past is allowed, and there is no overlap check), like a
   * reschedule. Marked Held, it is numbered and counted in the payment cycles like any Held session.
   */
  @Transactional()
  async createForGroup(groupId: string, dto: CreateSessionDto): Promise<Session> {
    const first = await this.sessions.findGroup(groupId);
    if (!first) throw groupNotFound();
    // Before the lock, so a caller who is not allowed does not wait on it.
    this.ensureMayAddTo(first.instructorId);

    await this.sessions.lockGroup(groupId);
    const group = await this.sessions.findGroup(groupId);
    if (!group) throw groupNotFound();
    this.ensureMayAddTo(group.instructorId);
    if (!group.isActive) {
      throw new AppException(ErrorCode.GroupInactive, HttpStatus.CONFLICT, 'The group is inactive');
    }

    if (dto.compensatesSessionId) await this.ensureCanCompensate(groupId, dto.compensatesSessionId);

    const id = await this.sessions.createManual({
      groupId,
      instructorId: group.instructorId,
      scheduledAt: new Date(dto.scheduledAt),
      durationMin: dto.durationMin,
      compensatesSessionId: dto.compensatesSessionId ?? null,
    });
    if (!id) throw alreadyCompensated();
    await this.audit.record({
      action: 'session.created',
      entityType: 'sessions',
      entityId: id,
      after: {
        scheduledAt: new Date(dto.scheduledAt).toISOString(),
        durationMin: dto.durationMin,
        compensatesSessionId: dto.compensatesSessionId ?? null,
      },
    });

    const created = await this.sessions.findById(id);
    if (!created) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    return toSession(created);
  }

  /** Scope `own` adds only to a group they teach now; scope `any` to any group. */
  private ensureMayAddTo(currentInstructorId: string): void {
    if (
      this.access.scopeFor('sessions.update') === 'own' &&
      currentInstructorId !== this.access.userId
    ) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
    }
  }

  private async ensureCanCompensate(groupId: string, targetId: string): Promise<void> {
    const target = await this.sessions.findById(targetId);
    if (!target || target.group.id !== groupId) {
      throw new AppException(
        ErrorCode.CompensatesSessionInvalid,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The session to make up for must be a session of this group',
        [{ field: 'compensatesSessionId', message: 'Not a session of this group' }],
      );
    }
    if (target.status !== 'cancelled') {
      throw new AppException(
        ErrorCode.SessionNotCancelled,
        HttpStatus.CONFLICT,
        'Only a cancelled session can be made up for',
      );
    }
    if (await this.sessions.hasMakeup(targetId)) throw alreadyCompensated();
  }

  /**
   * Moves a Scheduled session to another time (US-15, FR-10). Only scheduled_at changes: the
   * session stays Scheduled with no number, and keeps its occurrence_date (the slot occurrence it
   * stands for) and its duration. status_changed_* is left alone, because it records who last
   * changed the STATUS and a reschedule is not one; the audit entry says who moved it. The new
   * time is not checked against the future or against other sessions (decided for SCRUM-28).
   * Reminders (SCRUM-44) are computed from scheduled_at when the job runs, so a lead that
   * has not been sent yet follows the new time. A lead already sent is not sent again.
   * Same write scope and group lock as marking Held and cancelling.
   */
  @Transactional()
  async reschedule(id: string, dto: RescheduleSessionDto): Promise<Session> {
    const row = await this.loadForWrite(id);
    if (row.status !== 'scheduled') {
      throw new AppException(
        ErrorCode.SessionNotScheduled,
        HttpStatus.CONFLICT,
        'Only a scheduled session can be rescheduled',
      );
    }
    const scheduledAt = new Date(dto.scheduledAt);
    await this.sessions.setScheduledAt(id, scheduledAt);
    await this.audit.record({
      action: 'session.rescheduled',
      entityType: 'sessions',
      entityId: id,
      before: { scheduledAt: row.scheduledAt.toISOString() },
      after: { scheduledAt: scheduledAt.toISOString() },
    });

    const moved = await this.sessions.findById(id);
    if (!moved) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    return toSession(moved);
  }

  /**
   * The steps both writes share: load (404 if missing or another academy's), check the write
   * scope before waiting, lock the group, then load again and check again, because the
   * instructor on the session or its status can change while this request waited for the lock.
   */
  private async loadForWrite(id: string): Promise<SessionRow> {
    const first = await this.sessions.findById(id);
    if (!first) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    // Before the lock, so a caller who is not allowed does not wait on it.
    this.ensureMayWrite(first);

    await this.sessions.lockGroup(first.group.id);

    const row = await this.sessions.findById(id);
    if (!row) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    this.ensureMayWrite(row);
    return row;
  }

  /** Scope `own` writes only a session whose instructor is the caller. Scope `any` passes. */
  private ensureMayWrite(row: SessionRow): void {
    const scope = this.access.scopeFor('sessions.update');
    if (scope === 'own' && row.instructorId !== this.access.userId) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
    }
  }

  /**
   * Same group only. Scope `own` cannot skip an earlier session that is still Scheduled.
   * Scope `any` can (the admin unlock, until a missed session can be cancelled, SCRUM-27):
   * that earlier session stays Scheduled, so it is not numbered and will not enter a cycle.
   * Both scopes refuse when a Held session of the group is strictly later in time, so this
   * one cannot take a higher number than a session that happens after it. Equal times do not
   * count as earlier or later.
   */
  private async ensureOrder(row: SessionRow): Promise<void> {
    const scope = this.access.scopeFor('sessions.update');
    if (
      scope === 'own' &&
      (await this.sessions.countEarlierScheduled(row.group.id, row.scheduledAt)) > 0
    ) {
      throw new AppException(
        ErrorCode.SessionOutOfOrder,
        HttpStatus.CONFLICT,
        'An earlier session of this group is still scheduled',
      );
    }
    if ((await this.sessions.countLaterHeld(row.group.id, row.scheduledAt)) > 0) {
      throw new AppException(
        ErrorCode.SessionOutOfOrder,
        HttpStatus.CONFLICT,
        'This session is earlier than a session already marked Held',
      );
    }
  }

  /** `from` inclusive, `to` exclusive, so a range that contains nothing is a bad request. */
  private assertRange(query: ListSessionsQueryDto): void {
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'from must be before to',
      );
    }
  }
}

const groupNotFound = () =>
  new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
const alreadyCompensated = () =>
  new AppException(
    ErrorCode.SessionAlreadyCompensated,
    HttpStatus.CONFLICT,
    'This cancelled session already has a make-up',
  );
