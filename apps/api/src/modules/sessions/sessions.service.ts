import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Page, type Session } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import type { ListSessionsQueryDto } from './dto/list-sessions.query';
import { toSession } from './session.mapper';
import { SessionRepository } from './session.repository';

/**
 * Reading sessions (US-12). Scope `any` (the admin) sees every session of the academy.
 * Scope `own` (an instructor) sees the sessions of the groups they currently teach:
 * `groups.instructor_id`, not the instructor copied onto the session when it was generated.
 * Another academy's row is never found (404). Another instructor's row in this academy is 403.
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
    if (query.groupId) {
      const group = await this.sessions.findGroup(query.groupId);
      if (!group) {
        throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
      }
      this.access.ensureOwner(scope, group.instructorId);
    }
    if (scope === 'own' && query.instructorId && query.instructorId !== this.access.userId) {
      throw new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
    }

    const { rows, total } = await this.sessions.list(
      {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        groupId: query.groupId,
        instructorId: scope === 'own' ? this.access.userId : query.instructorId,
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
    this.access.ensureOwner(this.access.scopeFor('sessions.read'), row.group.instructorId);
    return toSession(row);
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
