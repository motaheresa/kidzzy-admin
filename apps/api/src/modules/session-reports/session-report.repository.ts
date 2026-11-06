import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import {
  MAX_SESSION_MINUTES,
  UNMARKED_AFTER_END_MINUTES,
  UNMARKED_MAX_AGE_MINUTES,
  UNMARKED_REPORTS_PER_RUN,
} from './session-report.constants';

export type SessionReportKind = 'held' | 'cancelled' | 'unmarked';

/** A Scheduled session that ended long enough ago to be reported as not marked. */
export interface UnmarkedSession {
  id: string;
  scheduledAt: Date;
  groupName: string;
  instructorName: string;
}

const MINUTE_MS = 60_000;

/**
 * Records which report was sent for a session and finds the sessions nobody marked (SCRUM-43).
 * Queries go through `txHost.tx`, limited to the academy in TenantContext.
 */
@Injectable()
export class SessionReportRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Claims this report. ON CONFLICT DO NOTHING (skipDuplicates): false when it was already sent
   * (a second tick, or an undo and another Held), so the caller skips notify instead of throwing.
   */
  async claim(input: {
    sessionId: string;
    kind: SessionReportKind;
    sentAt: Date;
  }): Promise<boolean> {
    const result = await this.txHost.tx.sessionReport.createMany({
      data: [
        {
          id: randomUUID(),
          academyId: this.tenant.requireAcademyId(),
          sessionId: input.sessionId,
          kind: input.kind,
          sentAt: input.sentAt,
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  /**
   * Scheduled sessions whose end (scheduled_at + duration_min) is between 24 hours and 2 hours
   * ago and that have no unmarked report yet, the oldest first, at most UNMARKED_REPORTS_PER_RUN.
   * The end is computed in SQL, so a scheduled_at bound is added to keep the
   * (academy_id, status, scheduled_at) index useful: no session lasts longer than 240 minutes.
   * Raw SQL is not tenant-scoped, so academy_id is filtered here.
   */
  async findUnmarked(now: Date): Promise<UnmarkedSession[]> {
    const academyId = this.tenant.requireAcademyId();
    const endedBefore = new Date(now.getTime() - UNMARKED_AFTER_END_MINUTES * MINUTE_MS);
    const endedAfter = new Date(now.getTime() - UNMARKED_MAX_AGE_MINUTES * MINUTE_MS);
    const startedAfter = new Date(endedAfter.getTime() - MAX_SESSION_MINUTES * MINUTE_MS);
    const rows = await this.txHost.tx.$queryRaw<
      { id: string; scheduled_at: Date; group_name: string; instructor_name: string }[]
    >`
      SELECT s.id, s.scheduled_at, g.name AS group_name, u.name AS instructor_name
      FROM sessions s
      JOIN groups g ON g.id = s.group_id AND g.academy_id = s.academy_id
      JOIN users u ON u.id = s.instructor_id AND u.academy_id = s.academy_id
      WHERE s.academy_id = ${academyId}::uuid
        AND s.status = 'scheduled'
        AND s.scheduled_at > ${startedAfter}
        AND s.scheduled_at + s.duration_min * interval '1 minute' > ${endedAfter}
        AND s.scheduled_at + s.duration_min * interval '1 minute' <= ${endedBefore}
        AND NOT EXISTS (
          SELECT 1 FROM session_reports r WHERE r.session_id = s.id AND r.kind = 'unmarked')
      ORDER BY s.scheduled_at ASC, s.id ASC
      LIMIT ${UNMARKED_REPORTS_PER_RUN}`;
    return rows.map((row) => ({
      id: row.id,
      scheduledAt: row.scheduled_at,
      groupName: row.group_name,
      instructorName: row.instructor_name,
    }));
  }
}
