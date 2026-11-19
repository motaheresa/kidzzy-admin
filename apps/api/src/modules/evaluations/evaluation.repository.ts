import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** The partial unique index that allows one pending request per student. */
export const ONE_PENDING_INDEX = 'student_evaluations_student_pending_key';

/** What every read of a request or an evaluation returns; the mapper builds the API shape from it. */
export const EVALUATION_SELECT = {
  id: true,
  source: true,
  status: true,
  instructorId: true,
  studentId: true,
  cycleId: true,
  requestedAt: true,
  overallRating: true,
  summary: true,
  strengths: true,
  toImprove: true,
  submittedAt: true,
  student: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  instructor: { select: { id: true, name: true } },
  cycle: { select: { cycleNumber: true } },
} as const satisfies Prisma.StudentEvaluationSelect;

export type EvaluationRow = Prisma.StudentEvaluationGetPayload<{
  select: typeof EVALUATION_SELECT;
}>;

/** A request that blocks its instructor: one from the admin always, one from a Due cycle while the rule is on. */
const BLOCKING = {
  status: 'pending',
  OR: [{ source: 'admin' }, { source: 'cycle_due', academy: { evaluationsRequired: true } }],
} as const satisfies Prisma.StudentEvaluationWhereInput;

/**
 * A student cycle that a Held session has just made Due. A student cycle belongs to the student,
 * not to a group (group_id is set only on instructor cycles), so the request takes the group of
 * the session that completed it.
 */
export interface DueStudentCycle {
  id: string;
  studentId: string;
}

/** The student an admin asks about, with the group of their open enrollment and its instructor. */
export interface StudentForRequest {
  id: string;
  name: string;
  openGroup: { id: string; name: string; instructorId: string } | null;
}

export interface NewRequest {
  studentId: string;
  instructorId: string;
  groupId: string;
  source: 'cycle_due' | 'admin';
  cycleId: string | null;
  requestedById: string | null;
  requestedAt: Date;
}

/**
 * Student evaluations (US-42, SCRUM-87): the only Prisma access for them. Rows are tenant-scoped
 * by the extension; a create still names the academy (CLAUDE.md, Data access).
 */
@Injectable()
export class EvaluationRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * How many requests block this user now. Login, refresh and /auth/me read it: the token's
   * pendingEvaluation claim is this count above zero, and the guard reads only the claim.
   */
  countBlocking(userId: string): Promise<number> {
    return this.txHost.tx.studentEvaluation.count({ where: { instructorId: userId, ...BLOCKING } });
  }

  /** The requests that block this user, oldest first: the evaluation screen shows them in order. */
  listBlockingFor(userId: string): Promise<EvaluationRow[]> {
    return this.txHost.tx.studentEvaluation.findMany({
      where: { instructorId: userId, ...BLOCKING },
      select: EVALUATION_SELECT,
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** The academy's requests with this status, newest first (the admin's settings screen lists pending). */
  listByStatus(status: 'pending'): Promise<EvaluationRow[]> {
    return this.txHost.tx.studentEvaluation.findMany({
      where: { status },
      select: EVALUATION_SELECT,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<EvaluationRow | null> {
    return this.txHost.tx.studentEvaluation.findFirst({ where: { id }, select: EVALUATION_SELECT });
  }

  /** Locks the request row for the rest of the transaction, so a submit and a cancel never interleave. */
  async lock(id: string): Promise<void> {
    await this.txHost.tx.$queryRaw`
      SELECT id FROM student_evaluations
      WHERE id = ${id}::uuid AND academy_id = ${this.tenant.requireAcademyId()}::uuid
      FOR UPDATE`;
  }

  hasPendingFor(studentId: string): Promise<boolean> {
    return this.txHost.tx.studentEvaluation
      .count({ where: { studentId, status: 'pending' } })
      .then((count) => count > 0);
  }

  /**
   * Creates a pending request. Returns null when the student already has one: the partial unique
   * index decides, so two Held sessions finishing at the same time cannot both create one. The
   * insert is ON CONFLICT DO NOTHING (createMany with skipDuplicates): a failed INSERT would abort
   * the whole Postgres transaction, and the Held that called it with it.
   */
  async createPending(request: NewRequest): Promise<EvaluationRow | null> {
    const academyId = this.tenant.requireAcademyId();
    const { count } = await this.txHost.tx.studentEvaluation.createMany({
      data: [
        {
          academyId,
          studentId: request.studentId,
          instructorId: request.instructorId,
          groupId: request.groupId,
          source: request.source,
          cycleId: request.cycleId,
          cycleAcademyId: request.cycleId ? academyId : null,
          requestedById: request.requestedById,
          requestedByAcademyId: request.requestedById ? academyId : null,
          requestedAt: request.requestedAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return null;
    // At most one pending row per student (the index), so this is the one just created.
    return this.txHost.tx.studentEvaluation.findFirst({
      where: { studentId: request.studentId, status: 'pending' },
      select: EVALUATION_SELECT,
    });
  }

  submit(
    id: string,
    evaluation: {
      overallRating: number;
      summary: string;
      strengths: string | null;
      toImprove: string | null;
    },
    at: Date,
  ): Promise<EvaluationRow> {
    return this.txHost.tx.studentEvaluation.update({
      where: { id },
      data: { ...evaluation, status: 'submitted', submittedAt: at },
      select: EVALUATION_SELECT,
    });
  }

  cancel(id: string, at: Date): Promise<EvaluationRow> {
    return this.txHost.tx.studentEvaluation.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: at },
      select: EVALUATION_SELECT,
    });
  }

  /** The student's written evaluations, newest first. */
  listSubmittedForStudent(studentId: string): Promise<EvaluationRow[]> {
    return this.txHost.tx.studentEvaluation.findMany({
      where: { studentId, status: 'submitted' },
      select: EVALUATION_SELECT,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });
  }

  /** The evaluations this instructor wrote, newest first. */
  listWrittenBy(userId: string): Promise<EvaluationRow[]> {
    return this.txHost.tx.studentEvaluation.findMany({
      where: { instructorId: userId, status: 'submitted' },
      select: EVALUATION_SELECT,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });
  }

  /**
   * The student cycles this Held session completed: counted by it and Due now. A cycle that was
   * already Due cannot count a new session, so these are exactly the ones it turned Due.
   */
  async listDueStudentCyclesOf(sessionId: string): Promise<DueStudentCycle[]> {
    const rows = await this.txHost.tx.paymentCycle.findMany({
      where: { payeeType: 'student', status: 'due', sessions: { some: { sessionId } } },
      select: { id: true, studentId: true },
      orderBy: { id: 'asc' },
    });
    return rows.flatMap((row) => (row.studentId ? [{ id: row.id, studentId: row.studentId }] : []));
  }

  /** The student, with the group of their open enrollment and its instructor (null when none). */
  async findStudentForRequest(studentId: string): Promise<StudentForRequest | null> {
    const student = await this.txHost.tx.student.findFirst({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        enrollments: {
          where: { endDate: null },
          select: { group: { select: { id: true, name: true, instructorId: true } } },
        },
      },
    });
    if (!student) return null;
    return { id: student.id, name: student.name, openGroup: student.enrollments[0]?.group ?? null };
  }

  studentExists(studentId: string): Promise<boolean> {
    return this.txHost.tx.student.count({ where: { id: studentId } }).then((count) => count > 0);
  }

  /**
   * The pending requests made by a Due cycle that is no longer Due: an undo took the cycle back.
   * The caller cancels them; a submitted evaluation is never touched.
   */
  listPendingWithCycleNoLongerDue(): Promise<{ id: string; cycleId: string | null }[]> {
    return this.txHost.tx.studentEvaluation.findMany({
      where: { status: 'pending', source: 'cycle_due', cycle: { status: { not: 'due' } } },
      select: { id: true, cycleId: true },
    });
  }
}
