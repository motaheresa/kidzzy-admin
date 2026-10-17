import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Group, type Page } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { InstructorRepository } from '../instructors/instructor.repository';
import { SessionGenerator } from '../sessions/session-generator';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { ListGroupsQueryDto } from './dto/list-groups.query';
import { toGroup } from './group.mapper';
import { GroupRepository, type GroupRow } from './group.repository';
import { findScheduleProblem } from './schedule';

/**
 * Groups and their weekly schedule (US-07): list, read and create.
 *
 * Read scope (groups.read): `any` (the admin) sees every group; `own` (an instructor) only the
 * groups they teach. AC-08 (US-03): an instructor opening another instructor's group gets 403;
 * another academy's group is 404, because the tenant scope never finds it.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly instructors: InstructorRepository,
    private readonly generator: SessionGenerator,
    private readonly access: AccessContext,
  ) {}

  async list(query: ListGroupsQueryDto): Promise<Page<Group>> {
    const scope = this.access.scopeFor('groups.read');
    let instructorId = query.instructorId;
    if (scope === 'own') {
      // An instructor only ever sees their own groups; asking for someone else's finds none.
      if (instructorId !== undefined && instructorId !== this.access.userId) {
        return toPage([], query, 0);
      }
      instructorId = this.access.userId;
    }
    const { rows, total } = await this.groups.list(
      { search: query.search || undefined, isActive: query.isActive, instructorId },
      pageWindow(query),
    );
    return toPage(rows.map(toGroup), query, total);
  }

  async get(id: string): Promise<Group> {
    const group = await this.findOrThrow(id);
    this.access.ensureOwner(this.access.scopeFor('groups.read'), group.instructor.id);
    return toGroup(group);
  }

  /** The group and its slots in one transaction. */
  @Transactional()
  async create(dto: CreateGroupDto): Promise<Group> {
    if (!(await this.instructors.findAssignable(dto.instructorId))) {
      throw notAssignable();
    }
    assertScheduleIsValid(dto.schedule);
    const created = await this.groups.create({
      name: dto.name,
      level: dto.level,
      instructorId: dto.instructorId,
      startDate: dto.startDate,
      slots: dto.schedule,
    });
    // The first sessions land with the group, in the same transaction (AC: sessions come from
    // the schedule). The daily job tops the horizon up afterwards.
    await this.generator.generateForGroup(created.id);
    return toGroup(await this.findOrThrow(created.id));
  }

  private async findOrThrow(id: string): Promise<GroupRow> {
    const group = await this.groups.findById(id);
    if (!group) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such group');
    }
    return group;
  }
}

function notAssignable(): AppException {
  return new AppException(
    ErrorCode.InstructorNotAssignable,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'The instructor must be an active instructor of this academy',
    [{ field: 'instructorId', message: 'The instructor is not active' }],
  );
}

/** 422 SCHEDULE_OVERLAP for two slots sharing time on a weekday, or a slot past midnight. */
export function assertScheduleIsValid(schedule: CreateGroupDto['schedule']): void {
  const problem = findScheduleProblem(schedule);
  if (!problem) return;
  const detail =
    problem === 'overlap' ? 'Two slots overlap on the same weekday' : 'A slot ends after midnight';
  throw new AppException(ErrorCode.ScheduleOverlap, HttpStatus.UNPROCESSABLE_ENTITY, detail, [
    { field: 'schedule', message: detail },
  ]);
}
