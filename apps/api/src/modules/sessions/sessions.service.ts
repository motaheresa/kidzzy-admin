import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Page, type Session } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
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
