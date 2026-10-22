import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type HeldResult, type Page, type Session } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { Clock } from './clock';
import type { ListSessionsQueryDto } from './dto/list-sessions.query';
import { toSession } from './session.mapper';
import { SessionRepository, type SessionRow } from './session.repository';

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
    const caller = this.access.userId;
    return row.group.instructorId === caller || row.instructorId === caller;
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
   * The admin session report (FR-26) is a later notification, not part of this write.
   */
  @Transactional()
  async markHeld(id: string): Promise<HeldResult> {
    const first = await this.sessions.findById(id);
    if (!first) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    // Before the lock, so a caller who is not allowed does not wait on it.
    this.ensureMayMark(first);

    await this.sessions.lockGroup(first.group.id);

    const row = await this.sessions.findById(id);
    if (!row) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }
    // The instructor on the session can change while this request waited for the lock.
    this.ensureMayMark(row);

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

    const sessionNumber = await this.sessions.nextSessionNumber(row.group.id);
    await this.sessions.markHeld(id, sessionNumber, this.access.userId, now);
    const held = await this.sessions.findById(id);
    if (!held) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
    }

    // TODO(SCRUM-38): count this Held session into the open payment cycles.
    // TODO(US-35): write the audit log for this status change.
    return { ...toSession(held), cyclesUpdated: [] };
  }

  /** Scope `own` writes only a session whose instructor is the caller. Scope `any` passes. */
  private ensureMayMark(row: SessionRow): void {
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
