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
import { CYCLE_SELECT } from '../payments/payment-cycle.repository';
import { uniqueViolationIndex } from '../prisma/prisma-errors';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { stringToDate } from '../sessions/dates';
import { TenantContext } from '../tenancy/tenant-context';

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
  // The open enrollment: at most one (partial unique index enrollments_student_open_key).
  enrollments: {
    where: { endDate: null },
    select: {
      startDate: true,
      group: { select: { id: true, name: true, instructorId: true } },
    },
  },
  // The cycle in progress: at most one (partial unique index payment_cycles_student_open_key).
  cycles: { where: { status: 'in_progress' }, select: CYCLE_SELECT },
} as const satisfies Prisma.StudentSelect;

/**
 * A student as the API shows it, with the open enrollment (its group and that group's
 * instructor, the owner for scope `own`) and the cycle in progress, each an array of 0 or 1.
 */
export type StudentRow = Prisma.StudentGetPayload<{ select: typeof STUDENT_SELECT }>;

/** Which students a list returns, besides the search. */
export interface StudentFilter {
  isActive?: boolean;
  search?: string;
  /** Students with an open enrollment in this group. */
  groupId?: string;
  /** Students with an open enrollment in a group this instructor teaches (scope own). */
  instructorId?: string;
}

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
    filter: StudentFilter,
    window: PageWindow,
  ): Promise<{ rows: StudentRow[]; total: number }> {
    const academyId = this.tenant.requireAcademyId();
    const conditions = [Prisma.sql`s.academy_id = ${academyId}::uuid`];
    if (filter.isActive !== undefined) {
      conditions.push(Prisma.sql`s.is_active = ${filter.isActive}`);
    }
    if (filter.groupId !== undefined || filter.instructorId !== undefined) {
      const enrolledIn = [
        Prisma.sql`e.student_id = s.id`,
        Prisma.sql`e.academy_id = ${academyId}::uuid`,
        Prisma.sql`e.end_date IS NULL`,
      ];
      if (filter.groupId !== undefined) {
        enrolledIn.push(Prisma.sql`e.group_id = ${filter.groupId}::uuid`);
      }
      if (filter.instructorId !== undefined) {
        enrolledIn.push(Prisma.sql`g.instructor_id = ${filter.instructorId}::uuid`);
      }
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM enrollments e
        JOIN groups g ON g.id = e.group_id AND g.academy_id = e.academy_id
        WHERE ${Prisma.join(enrolledIn, ' AND ')})`);
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

  /**
   * Locks the student row until the end of the transaction, so two changes of the same student's
   * enrollment or plan (enroll, transfer, plan change, deactivate) run one after the other.
   * Call it first in a @Transactional() method. Raw SQL: it filters academy_id itself.
   */
  async lock(id: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM students
      WHERE id = ${id}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
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

  /**
   * Deactivates the record and ends the open enrollment, if any, with `endDate` as its last day,
   * in one statement (a nested write of the student aggregate). Nothing is ever deleted.
   * Call findById first.
   */
  deactivate(id: string, endDate: string): Promise<StudentRow> {
    return this.txHost.tx.student.update({
      where: { id },
      data: {
        isActive: false,
        enrollments: {
          updateMany: { where: { endDate: null }, data: { endDate: stringToDate(endDate) } },
        },
      },
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
