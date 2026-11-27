import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, MATERIAL_LINKS_MAX, type MaterialLink } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../tenancy/tenant-context';
import type {
  CreateMaterialLinkDto,
  MaterialOrderDto,
  UpdateMaterialLinkDto,
} from './dto/material-link.dto';
import { toMaterialLink } from './material-link.mapper';
import { MaterialLinkRepository, type MaterialLinkRow } from './material-link.repository';

const ENTITY = 'material_links';

/**
 * The academy's course material links (US-32, US-33): one list, in the admin's order, with
 * positions 1, 2, 3… and no gaps. Every write is a transaction that starts by locking the academy,
 * so the limit, the next position and the order are read and written by one request at a time.
 */
@Injectable()
export class MaterialLinkService {
  constructor(
    private readonly links: MaterialLinkRepository,
    private readonly audit: AuditService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<MaterialLink[]> {
    return (await this.links.list()).map(toMaterialLink);
  }

  /** A new link goes to the end of the list. */
  @Transactional()
  async create(dto: CreateMaterialLinkDto): Promise<MaterialLink> {
    await this.links.lockAcademy();
    if ((await this.links.count()) >= MATERIAL_LINKS_MAX) {
      throw new AppException(
        ErrorCode.MaterialLinksLimit,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `At most ${MATERIAL_LINKS_MAX} material links`,
      );
    }
    const created = await this.links.create({
      title: dto.title,
      url: dto.url,
      sortOrder: (await this.links.lastPosition()) + 1,
    });
    await this.audit.record({
      action: 'material_link.created',
      entityType: ENTITY,
      entityId: created.id,
      after: auditValues(created),
    });
    return toMaterialLink(created);
  }

  @Transactional()
  async update(id: string, dto: UpdateMaterialLinkDto): Promise<MaterialLink> {
    await this.links.lockAcademy();
    const current = await this.find(id);
    const changes = {
      ...(dto.title !== undefined && dto.title !== current.title ? { title: dto.title } : {}),
      ...(dto.url !== undefined && dto.url !== current.url ? { url: dto.url } : {}),
    };
    if (Object.keys(changes).length === 0) return toMaterialLink(current);
    const updated = await this.links.update(id, changes);
    await this.audit.record({
      action: 'material_link.changed',
      entityType: ENTITY,
      entityId: id,
      before: auditValues(current),
      after: auditValues(updated),
    });
    return toMaterialLink(updated);
  }

  /** Permanent. The links after it move up by one, so the order stays and no gap is left. */
  @Transactional()
  async remove(id: string): Promise<void> {
    await this.links.lockAcademy();
    const current = await this.find(id);
    await this.links.delete(id);
    const following = await this.links.listAfter(current.sortOrder);
    await this.links.place(
      following.map((link) => ({ id: link.id, sortOrder: link.sortOrder - 1 })),
    );
    await this.audit.record({
      action: 'material_link.deleted',
      entityType: ENTITY,
      entityId: id,
      before: auditValues(current),
    });
  }

  /**
   * Saves the whole order: `ids` must name every link of the academy exactly once, so a list that
   * is out of date (a link added or deleted meanwhile) is refused instead of half applied.
   */
  @Transactional()
  async reorder(dto: MaterialOrderDto): Promise<MaterialLink[]> {
    await this.links.lockAcademy();
    const current = await this.links.list();
    const ids = dto.ids.map((id) => id.toLowerCase());
    const positions = new Map(current.map((link) => [link.id, link.sortOrder]));
    const complete =
      ids.length === current.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => positions.has(id));
    if (!complete) {
      const message = 'Send every material link exactly once';
      throw new AppException(ErrorCode.ValidationFailed, HttpStatus.UNPROCESSABLE_ENTITY, message, [
        { field: 'ids', message },
      ]);
    }
    const moved = ids
      .map((id, index) => ({ id, sortOrder: index + 1 }))
      .filter(({ id, sortOrder }) => positions.get(id) !== sortOrder);
    if (moved.length === 0) return current.map(toMaterialLink);
    await this.links.place(moved);
    await this.audit.record({
      action: 'material_link.reordered',
      entityType: ENTITY,
      // The event is about the whole list, which belongs to the academy.
      entityId: this.tenant.requireAcademyId(),
      after: { ids },
    });
    return this.list();
  }

  private async find(id: string): Promise<MaterialLinkRow> {
    const link = await this.links.findById(id); // null for another academy's link → 404
    if (!link) throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND);
    return link;
  }
}

function auditValues(row: MaterialLinkRow): Record<string, string> {
  return { title: row.title, url: row.url };
}
