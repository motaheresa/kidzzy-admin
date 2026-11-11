import { AttendanceStatus } from '@kidzzy/shared';
import { formatClock, formatDuration, formatWeekday } from '../sessions/session-time-format';
import { ABSENT_NAMES_CAP, REASON_CUT, TOPIC_CUT } from './session-report.constants';

/** The text of one report. Pure: the same facts always give the same text. */
export interface SessionReportText {
  title: string;
  body: string;
}

/** One student's line, as much as the report may know: never the note. */
export interface ReportAttendanceLine {
  status: AttendanceStatus;
  performanceRating: number | null;
  studentName: string;
}

/*
 * A student's note is about a child. It is never part of a report, a notification or a push, so
 * none of the builders below takes one: the attendance line has no note field, and the repository
 * query that feeds it does not select it.
 */

/** Cuts by code points (a surrogate pair is never split) and marks the cut with an ellipsis. */
export function cut(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, max).join('')}…`;
}

export function heldReport(input: {
  groupName: string;
  topic: string | null;
  /** The real length of the session (SCRUM-80); null for a session held before it was recorded. */
  durationMin: number | null;
  attendance: readonly ReportAttendanceLine[];
}): SessionReportText {
  const present = input.attendance.filter((line) => line.status === AttendanceStatus.Present);
  const absent = input.attendance.filter((line) => line.status === AttendanceStatus.Absent);
  const topic = input.topic ? `الشرح: ${cut(input.topic, TOPIC_CUT)}` : undefined;
  const duration =
    input.durationMin === null ? undefined : `المدة ${formatDuration(input.durationMin)}`;

  const parts: string[] = [];
  if (input.attendance.length === 0) {
    parts.push('مفيش طلاب مسجلين في الحصة');
    if (duration) parts.push(duration);
    if (topic) parts.push(topic);
  } else {
    parts.push(`حضر ${present.length} من ${input.attendance.length}`);
    if (duration) parts.push(duration);
    if (topic) parts.push(topic);
    if (absent.length > 0)
      parts.push(`غاب: ${absentNames(absent.map((line) => line.studentName))}`);
    const rated = present.flatMap((line) =>
      line.performanceRating === null ? [] : [line.performanceRating],
    );
    if (rated.length > 0) {
      const average = rated.reduce((sum, rating) => sum + rating, 0) / rated.length;
      parts.push(`متوسط الاداء ${average.toFixed(1)}`);
    }
  }
  return { title: `تقرير حصة: جروب ${input.groupName}`, body: parts.join('، ') };
}

export function cancelledReport(input: {
  groupName: string;
  scheduledAt: Date;
  zone: string;
  reason: string;
}): SessionReportText {
  return {
    title: `اتلغت حصة: جروب ${input.groupName}`,
    body: `${when(input.scheduledAt, input.zone)}، السبب: ${cut(input.reason, REASON_CUT)}`,
  };
}

export function unmarkedReport(input: {
  groupName: string;
  scheduledAt: Date;
  zone: string;
  instructorName: string;
}): SessionReportText {
  return {
    title: `حصة لسه متسجلتش: جروب ${input.groupName}`,
    body: `${when(input.scheduledAt, input.zone)}، المدرس ${input.instructorName}`,
  };
}

function when(scheduledAt: Date, zone: string): string {
  return `${formatWeekday(scheduledAt, zone)} الساعة ${formatClock(scheduledAt, zone)}`;
}

/** At most three names, then how many did not fit: "أ، ب، ت و2 كمان". */
function absentNames(names: readonly string[]): string {
  if (names.length <= ABSENT_NAMES_CAP) return names.join('، ');
  return `${names.slice(0, ABSENT_NAMES_CAP).join('، ')} و${names.length - ABSENT_NAMES_CAP} كمان`;
}
