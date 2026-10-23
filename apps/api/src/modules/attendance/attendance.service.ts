import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { DateTime } from 'luxon';
import { ErrorCode, type SessionAttendance } from '@kidzzy/shared';
import { AppException, type FieldError } from '../../common/errors/app.exception';
import { AcademyRepository } from '../academies/academy.repository';
import { AccessContext } from '../auth/access-context';
import { EnrollmentRepository } from '../enrollments/enrollment.repository';
import { Clock } from '../sessions/clock';
import { SessionRepository, type SessionRow } from '../sessions/session.repository';
import { isVisibleToInstructor } from '../sessions/session-visibility';
import { toSessionAttendance } from './attendance.mapper';
import { AttendanceRepository } from './attendance.repository';
import type { AttendanceRecordDto, SaveAttendanceDto } from './dto/save-attendance.dto';

const notFound = () =>
  new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such session');
const forbidden = () => new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');

/**
 * Attendance and ratings of a session (US-18, US-37), and reading them back (US-19).
 *
 * The students of a session are the enrollments of its group that cover the session's
 * academy-local date (start_date <= date <= end_date, or no end_date). A transferred student
 * therefore belongs to the group they were in that day.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly attendance: AttendanceRepository,
    private readonly academies: AcademyRepository,
    private readonly access: AccessContext,
    private readonly clock: Clock,
  ) {}

  /**
   * Scope `own` reads what it can see of sessions: it teaches the group now, or it is the
   * instructor on the session (ADR-0006 amendment). Any status: a session not yet Held just
   * lists its students with nothing recorded.
   */
  async get(sessionId: string): Promise<SessionAttendance> {
    const row = await this.sessions.findById(sessionId);
    if (!row) throw notFound();
    if (
      this.access.scopeFor('attendance.read') === 'own' &&
      !isVisibleToInstructor(row, this.access.userId)
    ) {
      throw forbidden();
    }
    return this.view(row);
  }

  /**
   * Saves the records sent: each student's row is inserted or updated, the others are left as
   * they are, so a partial save is fine and editing is allowed any time while the session is
   * Held. Writing is stricter than reading, the same rule as marking Held: scope `own` needs to
   * be the instructor on the session. The group row is locked first (the same lock as the
   * session writes), so this cannot interleave with a cancel or an undo of the same group.
   * Counting Held sessions into cycles does not depend on attendance (AC-02, SCRUM-38).
   */
  @Transactional()
  async save(sessionId: string, dto: SaveAttendanceDto): Promise<SessionAttendance> {
    this.assertNoDuplicateStudent(dto.records);

    const first = await this.sessions.findById(sessionId);
    if (!first) throw notFound();
    // Before the lock, so a caller who is not allowed does not wait on it.
    this.ensureMayRecord(first);

    await this.sessions.lockGroup(first.group.id);

    const row = await this.sessions.findById(sessionId);
    if (!row) throw notFound();
    this.ensureMayRecord(row);

    if (row.status !== 'held') {
      throw new AppException(
        ErrorCode.SessionNotHeld,
        HttpStatus.CONFLICT,
        'Attendance is recorded for a Held session',
      );
    }

    const students = await this.studentsOf(row);
    this.assertRecordsAreValid(dto.records, new Set(students.map((s) => s.studentId)));

    const now = this.clock.now();
    for (const record of dto.records) {
      await this.attendance.upsert({
        sessionId,
        studentId: record.studentId,
        status: record.status,
        performanceRating: record.performanceRating ?? null,
        homeworkRating: record.homeworkRating ?? null,
        recordedById: this.access.userId,
        recordedAt: now,
      });
    }

    // TODO(US-35): write the audit log for this change.
    return toSessionAttendance(sessionId, students, await this.attendance.findBySession(sessionId));
  }

  private async view(row: SessionRow): Promise<SessionAttendance> {
    const [students, recorded] = await Promise.all([
      this.studentsOf(row),
      this.attendance.findBySession(row.id),
    ]);
    return toSessionAttendance(row.id, students, recorded);
  }

  /** The session's students, by name: its group's enrollments on the session's local date. */
  private async studentsOf(row: SessionRow) {
    const zone = await this.academies.findTimezone();
    const day = DateTime.fromJSDate(row.scheduledAt, { zone }).toISODate();
    if (!day) throw new Error('The session time has no local date');
    return this.enrollments.listForGroupOnDate(row.group.id, day);
  }

  /** Scope `own` records only a session whose instructor is the caller. Scope `any` passes. */
  private ensureMayRecord(row: SessionRow): void {
    if (
      this.access.scopeFor('attendance.record') === 'own' &&
      row.instructorId !== this.access.userId
    ) {
      throw forbidden();
    }
  }

  /** The same student twice is a shape error: which line would win? */
  private assertNoDuplicateStudent(records: AttendanceRecordDto[]): void {
    const seen = new Set<string>();
    const errors: FieldError[] = [];
    records.forEach((record, index) => {
      if (seen.has(record.studentId)) {
        errors.push({
          field: `records.${index}.studentId`,
          message: 'studentId appears more than once',
        });
      }
      seen.add(record.studentId);
    });
    if (errors.length > 0) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'Each student may appear once',
        errors,
      );
    }
  }

  /** 422 for a student who is not in the session, then for a rating on an absent student. */
  private assertRecordsAreValid(records: AttendanceRecordDto[], studentIds: Set<string>): void {
    const notInSession: FieldError[] = [];
    const absentRated: FieldError[] = [];
    records.forEach((record, index) => {
      if (!studentIds.has(record.studentId)) {
        notInSession.push({
          field: `records.${index}.studentId`,
          message: 'The student is not in this session',
        });
      }
      if (record.status === 'absent') {
        if (record.performanceRating != null) {
          absentRated.push({
            field: `records.${index}.performanceRating`,
            message: 'An absent student cannot be rated',
          });
        }
        if (record.homeworkRating != null) {
          absentRated.push({
            field: `records.${index}.homeworkRating`,
            message: 'An absent student cannot be rated',
          });
        }
      }
    });
    if (notInSession.length > 0) {
      throw new AppException(
        ErrorCode.StudentNotInSession,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'A student is not in this session',
        notInSession,
      );
    }
    if (absentRated.length > 0) {
      throw new AppException(
        ErrorCode.StudentAbsent,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'An absent student cannot be rated',
        absentRated,
      );
    }
  }
}
