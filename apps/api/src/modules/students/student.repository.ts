import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ErrorCode } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../common/normalize/login-identifiers';
import { normalizeSearchText } from '../../common/normalize/search-text';
import { normalizeStudentCode } from '../../common/normalize/student-code';
import type { PageWindow } from '../../common/pagination/page';
import { escapeLike } from '../../common/search/escape-like';
import { Prisma } from '../../generated/prisma/client';
import { uniqueViolationIndex } from '../prisma/prisma-errors';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** A student as the API shows it. */
export interface StudentRow {
  id: string;
  code: string;
  name: string;
  age: number | null;
  parentName: string;
  parentPhone: string;
  notes: string | null;
  isActive: boolean;
}

export interface StudentChanges {
  code?: string;
  name?: string;
  age?: number | null;
  parentName?: string;
  parentPhone?: string;
  notes?: string | null;
}

const STUDENT_SELECT = {
  id: true,
  code: true,
  name: true,
  age: true,
  parentName: true,
  parentPhone: true,
  notes: true,
  isActive: true,
} as const satisfies Prisma.StudentSelect;

/**
 * Reads and writes student records (US-05). The code and the parent's phone are normalized
 * here, so every write matches the stored form (the database refuses any other).
 * Queries go through `txHost.tx` (the open transaction or `prisma.db`), limited to the academy
 * in TenantContext.
 */
@Injectable()
export class StudentRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of students and the total that match (US-05, US-06).
   *
   * With a search, a student matches on part of the name in its search form (normalizeSearchText:
   * "احمد" finds "أحمد", "فاطمه" finds "فاطمة") or part of the code. AC: an exact code match comes
   * first; then by name. Without a search, by name.
   *
   * Raw SQL, because Prisma's `contains` does not escape % and _ (escapeLike + ESCAPE '\' here)
   * and cannot sort by "is this the exact code". Raw SQL is never scoped automatically, so it
   * filters academy_id itself. Values are bound parameters, never pasted into the SQL text.
   * The SQL only picks the ids; the rows are then read through the scoped client.
   */
  async list(
    filter: { isActive?: boolean; search?: string },
    window: PageWindow,
  ): Promise<{ rows: StudentRow[]; total: number }> {
    const academyId = this.tenant.requireAcademyId();
    const conditions = [Prisma.sql`s.academy_id = ${academyId}::uuid`];
    if (filter.isActive !== undefined) {
      conditions.push(Prisma.sql`s.is_active = ${filter.isActive}`);
    }

    // A code is only letters and digits, which the search form keeps; so a search that is empty
    // in its search form (spaces, tatweel, diacritics only) is no search at all.
    const name = filter.search ? normalizeSearchText(filter.search) : '';
    const code = name ? normalizeStudentCode(filter.search ?? '') : '';
    if (name) {
      conditions.push(Prisma.sql`(
        s.name_search LIKE ${`%${escapeLike(name)}%`} ESCAPE '\\'
        OR s.code LIKE ${`%${escapeLike(code)}%`} ESCAPE '\\')`);
    }

    const where = Prisma.join(conditions, ' AND ');
    const order = code
      ? Prisma.sql`(s.code = ${code}) DESC, s.name, s.id`
      : Prisma.sql`s.name, s.id`;

    const [counted] = await this.txHost.tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM students s WHERE ${where}`;
    const ids = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM students s WHERE ${where}
      ORDER BY ${order}
      LIMIT ${window.take} OFFSET ${window.skip}`;

    const rows = await this.txHost.tx.student.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      select: STUDENT_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      rows: ids.flatMap(({ id }) => byId.get(id) ?? []),
      total: Number(counted?.total ?? 0),
    };
  }

  /** The student in the current academy, or null (unknown id or another academy). */
  findById(id: string): Promise<StudentRow | null> {
    return this.txHost.tx.student.findFirst({ where: { id }, select: STUDENT_SELECT });
  }

  /** A code already used in the academy gives 409 STUDENT_CODE_TAKEN. */
  async create(input: {
    code: string;
    name: string;
    age: number | null;
    parentName: string;
    parentPhone: string;
    notes: string | null;
  }): Promise<StudentRow> {
    try {
      return await this.txHost.tx.student.create({
        data: {
          academyId: this.tenant.requireAcademyId(),
          ...input,
          nameSearch: normalizeSearchText(input.name),
          code: normalizeStudentCode(input.code),
          parentPhone: normalizePhone(input.parentPhone),
        },
        select: STUDENT_SELECT,
      });
    } catch (error) {
      throw asConflict(error);
    }
  }

  /** Changes the fields given; null clears age or notes. Call findById first. */
  async update(id: string, changes: StudentChanges): Promise<StudentRow> {
    const data: Prisma.StudentUpdateInput = { ...changes };
    if (changes.name !== undefined) data.nameSearch = normalizeSearchText(changes.name);
    if (changes.code !== undefined) data.code = normalizeStudentCode(changes.code);
    if (changes.parentPhone !== undefined) data.parentPhone = normalizePhone(changes.parentPhone);
    try {
      return await this.txHost.tx.student.update({ where: { id }, data, select: STUDENT_SELECT });
    } catch (error) {
      throw asConflict(error);
    }
  }

  /** Activates or deactivates the record. Nothing is ever deleted. Call findById first. */
  setActive(id: string, isActive: boolean): Promise<StudentRow> {
    return this.txHost.tx.student.update({
      where: { id },
      data: { isActive },
      select: STUDENT_SELECT,
    });
  }
}

/** The unique index on (academy_id, code) becomes 409 STUDENT_CODE_TAKEN; other errors pass. */
function asConflict(error: unknown): unknown {
  if (uniqueViolationIndex(error) !== 'students_academy_id_code_key') return error;
  return new AppException(
    ErrorCode.StudentCodeTaken,
    HttpStatus.CONFLICT,
    'This code is already used in the academy',
  );
}
