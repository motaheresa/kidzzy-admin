import { HttpStatus, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  ErrorCode,
  type GroupAttendance,
  type Page,
  type StudentAttendanceItem,
  type StudentRef,
} from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AcademyRepository } from '../academies/academy.repository';
import { AccessContext } from '../auth/access-context';
import { EnrollmentRepository, type EnrollmentRow } from '../enrollments/enrollment.repository';
import { GroupRepository } from '../groups/group.repository';
import { dateToString } from '../sessions/dates';
import { SessionRepository } from '../sessions/session.repository';
import { StudentRepository } from '../students/student.repository';
import { toGroupAttendance, toStudentAttendanceItem } from './attendance.mapper';
import { AttendanceRepository } from './attendance.repository';
import type {
  GroupAttendanceQueryDto,
  StudentAttendanceQueryDto,
} from './dto/attendance-views.query';

const notFound = (what: string) =>
  new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such ' + what);
const forbidden = () => new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');

/**
 * Reading attendance across sessions (US-19): the grid of a group and the history of a student.
 * Only Held sessions appear. Scope `own` follows the sessions visibility rule (ADR-0006
 * amendment): the caller sees a session when they teach its group now OR they are the
 * instructor on it, so a former instructor keeps what they taught.
 */
@Injectable()
export class AttendanceViewsService {
  constructor(
    private readonly groups: GroupRepository,
    private readonly students: StudentRepository,
    private readonly sessions: SessionRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly attendance: AttendanceRepository,
    private readonly academies: AcademyRepository,
    private readonly access: AccessContext,
  ) {}

  /**
   * Students by the group's Held sessions between two academy-local dates, both included, in
   * the academy's timezone. A student is a row when their enrollment covers the date of at
   * least one of those sessions; a cell is missing when nothing was recorded for them.
   *
   * Scope `own`: the group's current instructor sees every session; someone who only taught
   * some of its sessions sees only those; someone with no session in the group gets 403.
   */
  async ofGroup(groupId: string, query: GroupAttendanceQueryDto): Promise<GroupAttendance> {
    const group = await this.groups.findById(groupId);
    if (!group) throw notFound('group');

    let onlyInstructorId: string | undefined;
    if (this.access.scopeFor('attendance.read') === 'own') {
      const caller = this.access.userId;
      if (group.instructor.id !== caller) {
        if (!(await this.sessions.instructorHasSession(groupId, caller))) throw forbidden();
        onlyInstructorId = caller;
      }
    }

    if (query.from && query.to && query.from > query.to) {
      throw new AppException(
        ErrorCode.ValidationFailed,
        HttpStatus.BAD_REQUEST,
        'from must not be after to',
        [{ field: 'from', message: 'from must not be after to' }],
      );
    }
    const zone = await this.academies.findTimezone();
    const sessions = await this.sessions.listHeldForGroup(
      groupId,
      {
        from: query.from
          ? DateTime.fromISO(query.from, { zone }).startOf('day').toJSDate()
          : undefined,
        to: query.to
          ? DateTime.fromISO(query.to, { zone }).plus({ days: 1 }).startOf('day').toJSDate()
          : undefined,
      },
      onlyInstructorId,
    );
    if (sessions.length === 0) return toGroupAttendance([], [], []);

    const days = sessions.map((session) => localDay(session.scheduledAt, zone));
    const enrolled = await this.enrollments.listForGroupBetween(
      groupId,
      days[0] ?? '',
      days[days.length - 1] ?? '',
    );
    const students = new Map<string, StudentRef>();
    for (const enrollment of enrolled) {
      if (days.some((day) => covers(enrollment, day))) {
        students.set(enrollment.studentId, {
          id: enrollment.studentId,
          code: enrollment.student.code,
          name: enrollment.student.name,
        });
      }
    }
    const recorded = await this.attendance.findForSessions(sessions.map((s) => s.id));
    return toGroupAttendance(
      sessions,
      [...students.values()].sort((a, b) => a.name.localeCompare(b.name)),
      recorded,
    );
  }

  /**
   * A student's attendance, newest session first. Scope `own` sees the records of sessions it
   * can see. It is 403 when it has no link to the student: the student is not in a group it
   * teaches now and none of the student's records is on a session it can see.
   */
  async ofStudent(
    studentId: string,
    query: StudentAttendanceQueryDto,
  ): Promise<Page<StudentAttendanceItem>> {
    const student = await this.students.findById(studentId);
    if (!student) throw notFound('student');

    const caller =
      this.access.scopeFor('attendance.read') === 'own' ? this.access.userId : undefined;
    const { rows, total } = await this.attendance.listForStudent(
      studentId,
      pageWindow(query),
      caller,
    );
    if (caller && total === 0 && student.enrollments[0]?.group.instructorId !== caller) {
      throw forbidden();
    }
    return toPage(rows.map(toStudentAttendanceItem), query, total);
  }
}

/** The academy-local date (YYYY-MM-DD) of an instant. */
function localDay(instant: Date, zone: string): string {
  const day = DateTime.fromJSDate(instant, { zone }).toISODate();
  if (!day) throw new Error('The session time has no local date');
  return day;
}

/** An enrollment covers a day from its start_date to its end_date, both included. */
function covers(enrollment: EnrollmentRow, day: string): boolean {
  return (
    dateToString(enrollment.startDate) <= day &&
    (enrollment.endDate === null || dateToString(enrollment.endDate) >= day)
  );
}
