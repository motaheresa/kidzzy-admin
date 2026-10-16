import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { ErrorCode } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../common/normalize/login-identifiers';
import { normalizeStudentCode } from '../../common/normalize/student-code';
import type { PageWindow } from '../../common/pagination/page';
import type { Prisma } from '../../generated/prisma/client';
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

  /** One page of students, sorted by name, and the total that match. */
  async list(
    filter: { isActive?: boolean },
    window: PageWindow,
  ): Promise<{ rows: StudentRow[]; total: number }> {
    const where: Prisma.StudentWhereInput =
      filter.isActive === undefined ? {} : { isActive: filter.isActive };
    const [rows, total] = await Promise.all([
      this.txHost.tx.student.findMany({
        where,
        select: STUDENT_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.student.count({ where }),
    ]);
    return { rows, total };
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
