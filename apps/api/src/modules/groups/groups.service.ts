import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Group, type Page } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { InstructorRepository } from '../instructors/instructor.repository';
import { Clock } from '../sessions/clock';
import { SessionGenerator } from '../sessions/session-generator';
import { SessionRegeneration } from '../sessions/session-regeneration';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { ListGroupsQueryDto } from './dto/list-groups.query';
import type { ReplaceScheduleDto } from './dto/replace-schedule.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import { toGroup } from './group.mapper';
import { GroupRepository, type GroupRow } from './group.repository';
import { diffSchedule, findScheduleProblem } from './schedule';

/**
 * Groups and their weekly schedule: list, read and create (US-07), edit the details and replace
 * the schedule (US-10).
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
    private readonly regeneration: SessionRegeneration,
    private readonly clock: Clock,
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

  /**
   * PATCH /groups/{id} (US-10): name, level, instructor and active flag, in one transaction.
   * - scope `any` edits every group; `own` only the group they teach (403 for another's), and
   *   `own` cannot change the instructor (403): they could not give a group away or take one.
   * - a new instructor must be assignable (422); only the sessions still ahead and Scheduled
   *   follow (Held and Cancelled keep their instructor).
   * - deactivating removes the generated sessions still ahead and Scheduled; reactivating
   *   generates them again.
   */
  @Transactional()
  async update(id: string, dto: UpdateGroupDto): Promise<Group> {
    await this.groups.lock(id);
    const group = await this.findOrThrow(id);
    const scope = this.access.scopeFor('groups.update');
    this.access.ensureOwner(scope, group.instructor.id);
    if (dto.instructorId !== undefined && scope !== 'any') {
      throw new AppException(
        ErrorCode.Forbidden,
        HttpStatus.FORBIDDEN,
        'Only an admin can change the instructor of a group',
      );
    }

    const changes: Parameters<GroupRepository['update']>[1] = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.level !== undefined) changes.level = dto.level;
    const newInstructor =
      dto.instructorId !== undefined && dto.instructorId !== group.instructor.id;
    if (newInstructor) {
      if (!(await this.instructors.findAssignable(dto.instructorId!))) throw notAssignable();
      changes.instructorId = dto.instructorId;
    }
    const activeChanged = dto.isActive !== undefined && dto.isActive !== group.isActive;
    if (activeChanged) changes.isActive = dto.isActive;

    if (Object.keys(changes).length > 0) await this.groups.update(id, changes);
    if (newInstructor) await this.regeneration.reassign(id, dto.instructorId!);
    if (activeChanged) {
      if (dto.isActive) await this.generator.generateForGroup(id);
      else await this.regeneration.dropForGroup(id);
    }
    return toGroup(await this.findOrThrow(id));
  }

  /**
   * PUT /groups/{id}/schedule (US-10): replaces the weekly schedule and rebuilds only what
   * changed, in one transaction (the group row is locked, so two edits never interleave).
   * - a slot that did not change keeps its row and its sessions;
   * - a slot that left loses its future Scheduled sessions, then its row is deleted, or retired
   *   when Held, Cancelled or past sessions still point at it (they keep it as history);
   * - a new slot gets its sessions (and a retired slot that returns is used again).
   * Held and Cancelled sessions never change (AC). An inactive group only stores the slots.
   */
  @Transactional()
  async replaceSchedule(id: string, dto: ReplaceScheduleDto): Promise<Group> {
    await this.groups.lock(id);
    const group = await this.findOrThrow(id);
    this.access.ensureOwner(this.access.scopeFor('groups.update'), group.instructor.id);
    assertScheduleIsValid(dto.schedule);

    const diff = diffSchedule(await this.groups.findAllSlots(id), dto.schedule);
    const removedIds = diff.remove.map((slot) => slot.id);
    const inUse = new Set(await this.regeneration.dropForSlots(removedIds));
    await this.groups.retireSlots(
      removedIds.filter((slotId) => inUse.has(slotId)),
      this.clock.now(),
    );
    await this.groups.deleteSlots(removedIds.filter((slotId) => !inUse.has(slotId)));
    await this.groups.reviveSlots(diff.revive.map((slot) => slot.id));
    await this.groups.addSlots(id, diff.add);

    if (group.isActive) await this.generator.generateForGroup(id);
    return toGroup(await this.findOrThrow(id));
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
