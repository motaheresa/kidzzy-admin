import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ErrorCode, SystemRole } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { normalizeEmail, normalizePhone } from '../../common/normalize/login-identifiers';
import { normalizeSearchText } from '../../common/normalize/search-text';
import type { PageWindow } from '../../common/pagination/page';
import { escapeLike } from '../../common/search/escape-like';
import { Prisma } from '../../generated/prisma/client';
import { uniqueViolationIndex } from '../prisma/prisma-errors';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** An instructor as the API shows it. */
export interface InstructorRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface InstructorFilter {
  search?: string;
  isActive?: boolean;
}

const INSTRUCTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

/** An instructor is a user holding the seeded Instructor system role (an admin is not one). */
const HOLDS_INSTRUCTOR_ROLE = {
  roles: { some: { role: { name: SystemRole.Instructor, isSystem: true } } },
} as const satisfies Prisma.UserWhereInput;

/** The unique indexes of users (schema.prisma) and the conflict each one means. */
const UNIQUE_CONFLICTS: Record<string, ErrorCode> = {
  users_academy_id_email_key: ErrorCode.EmailTaken,
  users_academy_id_phone_key: ErrorCode.PhoneTaken,
};

/**
 * Reads and writes instructors: users with the Instructor role (US-04). Admins never appear
 * here, so an admin's id answers 404 on every instructor endpoint.
 *
 * Email and phone are normalized here, like in UserRepository, so a write always matches the
 * stored form (the database refuses any other).
 *
 * Scoped queries go through `txHost.tx` (the open transaction or `prisma.db`). The list uses raw
 * SQL, which is NEVER scoped automatically: it filters academy_id itself (CLAUDE.md, Data access).
 */
@Injectable()
export class InstructorRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of instructors, sorted by name, and the total that match.
   *
   * Raw SQL because the search is a partial match on text the user typed: Prisma's `contains`
   * does not escape % and _, so "%" would match everyone. Here every LIKE pattern goes through
   * escapeLike with ESCAPE '\'. The values are bound parameters ($1, $2…), never pasted into the
   * SQL text, so they cannot inject SQL.
   *
   * The SQL only picks the ids; the rows are then read through the scoped client.
   */
  async list(
    filter: InstructorFilter,
    window: PageWindow,
  ): Promise<{ rows: InstructorRow[]; total: number }> {
    const where = this.listConditions(filter);
    const [counted] = await this.txHost.tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM users u WHERE ${where}`;
    const ids = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u WHERE ${where}
      ORDER BY u.name, u.id
      LIMIT ${window.take} OFFSET ${window.skip}`;

    const rows = await this.txHost.tx.user.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      select: INSTRUCTOR_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      rows: ids.flatMap(({ id }) => byId.get(id) ?? []),
      total: Number(counted?.total ?? 0),
    };
  }

  /**
   * Locks the user row until the end of the transaction, so two changes of the same instructor's
   * plan run one after the other and get consecutive versions. Call it first in a
   * @Transactional() method. Raw SQL: it filters academy_id itself.
   */
  async lock(id: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM users
      WHERE id = ${id}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  /** The instructor in the current academy, or null (unknown id, an admin, another academy). */
  findById(id: string): Promise<InstructorRow | null> {
    return this.txHost.tx.user.findFirst({
      where: { id, ...HOLDS_INSTRUCTOR_ROLE },
      select: INSTRUCTOR_SELECT,
    });
  }

  /**
   * True when the user is an ACTIVE instructor of the current academy: the only users a group
   * can be given to (US-07). An admin, a deactivated instructor, an unknown id or another
   * academy's user all answer false.
   */
  async findAssignable(id: string): Promise<boolean> {
    const found = await this.txHost.tx.user.findFirst({
      where: { id, isActive: true, ...HOLDS_INSTRUCTOR_ROLE },
      select: { id: true },
    });
    return found !== null;
  }

  /** The instructor's active groups, by name: the groups list of their detail screen. */
  findGroupRefs(instructorId: string): Promise<{ id: string; name: string }[]> {
    return this.txHost.tx.group.findMany({
      where: { instructorId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Creates the user and gives it the Instructor role. The role is looked up through the scoped
   * client, so only this academy's role can ever be attached.
   * A duplicate email or phone in the academy gives 409 EMAIL_TAKEN / PHONE_TAKEN.
   */
  async create(input: {
    name: string;
    email: string | null;
    phone: string | null;
    passwordHash: string;
  }): Promise<InstructorRow> {
    const role = await this.txHost.tx.role.findFirst({
      where: { name: SystemRole.Instructor, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error('The Instructor system role is missing; run the seed');

    try {
      return await this.txHost.tx.user.create({
        data: {
          academyId: this.tenant.requireAcademyId(),
          name: input.name,
          nameSearch: normalizeSearchText(input.name),
          email: input.email === null ? null : normalizeEmail(input.email),
          phone: input.phone === null ? null : normalizePhone(input.phone),
          passwordHash: input.passwordHash,
          // The admin chose the password; the instructor replaces it at the first login (US-02).
          mustChangePassword: true,
          roles: { create: { roleId: role.id } },
        },
        select: INSTRUCTOR_SELECT,
      });
    } catch (error) {
      throw asConflict(error);
    }
  }

  /** Changes name, email or phone; null removes email or phone. Call findById first. */
  async update(
    id: string,
    changes: { name?: string; email?: string | null; phone?: string | null },
  ): Promise<InstructorRow> {
    const data: Prisma.UserUpdateInput = {};
    if (changes.name !== undefined) {
      data.name = changes.name;
      data.nameSearch = normalizeSearchText(changes.name);
    }
    if (changes.email !== undefined) {
      data.email = changes.email === null ? null : normalizeEmail(changes.email);
    }
    if (changes.phone !== undefined) {
      data.phone = changes.phone === null ? null : normalizePhone(changes.phone);
    }
    try {
      return await this.txHost.tx.user.update({ where: { id }, data, select: INSTRUCTOR_SELECT });
    } catch (error) {
      throw asConflict(error);
    }
  }

  /** Activates or deactivates the account. Nothing is ever deleted. Call findById first. */
  setActive(id: string, isActive: boolean): Promise<InstructorRow> {
    return this.txHost.tx.user.update({
      where: { id },
      data: { isActive },
      select: INSTRUCTOR_SELECT,
    });
  }

  /**
   * A temporary password set by the admin (US-02): the instructor must replace it at the next
   * login. Call findById first.
   */
  async setTemporaryPassword(id: string, passwordHash: string): Promise<void> {
    await this.txHost.tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
  }

  /** WHERE conditions of the list, joined with AND. academy_id is filtered here, by hand. */
  private listConditions(filter: InstructorFilter): Prisma.Sql {
    const academyId = this.tenant.requireAcademyId();
    const conditions = [
      Prisma.sql`u.academy_id = ${academyId}::uuid`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.academy_id = ${academyId}::uuid
          AND r.name = ${SystemRole.Instructor} AND r.is_system)`,
    ];
    if (filter.isActive !== undefined) {
      conditions.push(Prisma.sql`u.is_active = ${filter.isActive}`);
    }
    if (filter.search) {
      conditions.push(Prisma.sql`(${Prisma.join(searchAlternatives(filter.search), ' OR ')})`);
    }
    return Prisma.join(conditions, ' AND ');
  }
}

/**
 * The search matches part of the name in its search form (normalizeSearchText: "احمد" finds
 * "أحمد", any case), of the email, or of the phone's digits.
 */
function searchAlternatives(search: string): Prisma.Sql[] {
  const alternatives = [
    Prisma.sql`u.email LIKE ${`%${escapeLike(normalizeEmail(search))}%`} ESCAPE '\\'`,
  ];
  const name = normalizeSearchText(search);
  if (name) {
    alternatives.push(Prisma.sql`u.name_search LIKE ${`%${escapeLike(name)}%`} ESCAPE '\\'`);
  }
  const digits = search.replace(/\D/g, '');
  if (digits) alternatives.push(Prisma.sql`u.phone LIKE ${`%${digits}%`}`);
  return alternatives;
}

/** A unique violation on email or phone becomes its 409; any other error is returned as it is. */
function asConflict(error: unknown): unknown {
  const index = uniqueViolationIndex(error);
  const code = index ? UNIQUE_CONFLICTS[index] : undefined;
  if (!code) return error;
  const field = code === ErrorCode.EmailTaken ? 'email' : 'phone';
  return new AppException(code, HttpStatus.CONFLICT, `This ${field} is already used`);
}
