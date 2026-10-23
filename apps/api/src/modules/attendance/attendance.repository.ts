import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AttendanceStatus } from '@kidzzy/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

const ATTENDANCE_SELECT = {
  studentId: true,
  status: true,
  performanceRating: true,
  homeworkRating: true,
} as const satisfies Prisma.AttendanceSelect;

export type AttendanceRow = Prisma.AttendanceGetPayload<{ select: typeof ATTENDANCE_SELECT }>;

/** What one save writes for one student. */
export interface AttendanceWrite {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
  recordedById: string;
  recordedAt: Date;
}

/**
 * Reads and writes attendance (US-18, US-37). Queries go through `txHost.tx` (the open
 * transaction or `prisma.db`), limited to the academy in TenantContext.
 */
@Injectable()
export class AttendanceRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** What is recorded for the session so far. A student nobody recorded has no row. */
  findBySession(sessionId: string): Promise<AttendanceRow[]> {
    return this.txHost.tx.attendance.findMany({
      where: { sessionId },
      select: ATTENDANCE_SELECT,
    });
  }

  /**
   * Inserts the student's row or updates it (unique on session_id + student_id), so saving the
   * same student again changes the row instead of adding one. Nothing else is touched.
   */
  async upsert(write: AttendanceWrite): Promise<void> {
    const values = {
      status: write.status,
      performanceRating: write.performanceRating,
      homeworkRating: write.homeworkRating,
      recordedById: write.recordedById,
      recordedAt: write.recordedAt,
    };
    await this.txHost.tx.attendance.upsert({
      where: { sessionId_studentId: { sessionId: write.sessionId, studentId: write.studentId } },
      create: {
        academyId: this.tenant.requireAcademyId(),
        sessionId: write.sessionId,
        studentId: write.studentId,
        ...values,
      },
      update: values,
    });
  }
}
