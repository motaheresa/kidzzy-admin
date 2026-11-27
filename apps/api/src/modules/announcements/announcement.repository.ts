import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../generated/prisma/client';
import { normalizeEmail } from '../../common/normalize/login-identifiers';
import { normalizeSearchText } from '../../common/normalize/search-text';
import type { PageWindow } from '../../common/pagination/page';
import { escapeLike } from '../../common/search/escape-like';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** What every read of a sent announcement returns; the mapper builds the API shape from it. */
const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  audience: true,
  roleId: true,
  recipientCount: true,
  createdAt: true,
  sender: { select: { id: true, name: true } },
  role: { select: { name: true } },
} as const satisfies Prisma.AnnouncementSelect;

export type AnnouncementRow = Prisma.AnnouncementGetPayload<{
  select: typeof ANNOUNCEMENT_SELECT;
}>;

export interface NewAnnouncement {
  senderId: string;
  title: string;
  body: string;
  audience: 'all' | 'role' | 'users';
  roleId: string | null;
  recipientCount: number;
}

export interface AudienceUserRow {
  id: string;
  name: string;
  roles: { role: { name: string } }[];
}

/**
 * Announcements (US-31): the only Prisma access for them, the reads of users and roles that
 * resolve an audience included. Rows are tenant-scoped by the extension, so another academy's
 * role or user is never found.
 */
@Injectable()
export class AnnouncementRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** Every active user of the academy but one (the sender). */
  listActiveUserIds(excludingId: string): Promise<string[]> {
    return this.ids({ isActive: true, id: { not: excludingId } });
  }

  /** Every active user holding the role, but one. */
  listActiveUserIdsInRole(roleId: string, excludingId: string): Promise<string[]> {
    return this.ids({ isActive: true, id: { not: excludingId }, roles: { some: { roleId } } });
  }

  /** Which of these ids are active users of the academy. The caller compares the two lists. */
  listActiveUserIdsAmong(ids: string[]): Promise<string[]> {
    return this.ids({ isActive: true, id: { in: ids } });
  }

  /** Null when there is no such role in this academy. */
  findRole(id: string): Promise<{ id: string; name: string } | null> {
    return this.txHost.tx.role.findFirst({ where: { id }, select: { id: true, name: true } });
  }

  create(announcement: NewAnnouncement): Promise<AnnouncementRow> {
    const academyId = this.tenant.requireAcademyId();
    return this.txHost.tx.announcement.create({
      data: {
        ...announcement,
        academyId,
        roleAcademyId: announcement.roleId ? academyId : null,
      },
      select: ANNOUNCEMENT_SELECT,
    });
  }

  /** The sent announcements, newest first. */
  async list(window: PageWindow): Promise<{ rows: AnnouncementRow[]; total: number }> {
    const rows = await this.txHost.tx.announcement.findMany({
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...window,
    });
    return { rows, total: await this.txHost.tx.announcement.count() };
  }

  listRoles(): Promise<{ id: string; name: string }[]> {
    return this.txHost.tx.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * One page of the active users the picker offers, by name, except one (the sender). The search
   * matches part of the name in its search form or of the email. Raw SQL because the text is the
   * user's: Prisma's `contains` would treat % and _ as wildcards. Raw SQL is not tenant-scoped,
   * so it filters by academy_id itself.
   */
  async listUsers(
    search: string | undefined,
    excludingId: string,
    window: PageWindow,
  ): Promise<{ rows: AudienceUserRow[]; total: number }> {
    const academyId = this.tenant.requireAcademyId();
    const conditions = [
      Prisma.sql`u.academy_id = ${academyId}::uuid`,
      Prisma.sql`u.is_active`,
      Prisma.sql`u.id <> ${excludingId}::uuid`,
    ];
    if (search) {
      const alternatives = [
        Prisma.sql`u.email LIKE ${`%${escapeLike(normalizeEmail(search))}%`} ESCAPE '\\'`,
      ];
      const name = normalizeSearchText(search);
      if (name) {
        alternatives.push(Prisma.sql`u.name_search LIKE ${`%${escapeLike(name)}%`} ESCAPE '\\'`);
      }
      conditions.push(Prisma.sql`(${Prisma.join(alternatives, ' OR ')})`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const found = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u WHERE ${where}
      ORDER BY u.name_search, u.id
      LIMIT ${window.take} OFFSET ${window.skip}`;
    const [counted] = await this.txHost.tx.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`;

    const users = await this.txHost.tx.user.findMany({
      where: { id: { in: found.map(({ id }) => id) } },
      select: {
        id: true,
        name: true,
        roles: { select: { role: { select: { name: true } } }, orderBy: { role: { name: 'asc' } } },
      },
    });
    // `in` returns any order; the raw query decided it.
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      rows: found.flatMap(({ id }) => byId.get(id) ?? []),
      total: counted?.total ?? 0,
    };
  }

  private async ids(where: Prisma.UserWhereInput): Promise<string[]> {
    const rows = await this.txHost.tx.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(({ id }) => id);
  }
}
