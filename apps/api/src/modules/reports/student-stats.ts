import {
  REPEATED_ABSENCE_THRESHOLD,
  type CycleStatus,
  type ReportGranularity,
  type StudentsBucket,
  type StudentsReportKpis,
  type StudentsReportRow,
} from '@kidzzy/shared';
import { localDateOf } from '../sessions/occurrences';
import { bucketKeyOf, bucketKeys, granularityOf } from './session-stats';

/** The student fields a report needs. */
export interface StatStudent {
  id: string;
  name: string;
  isActive: boolean;
}

/** One enrollment: dates are academy-local (YYYY-MM-DD), `endDate` null is the open one. */
export interface StatEnrollment {
  studentId: string;
  startDate: string;
  endDate: string | null;
  group: { id: string; name: string };
}

/**
 * One attendance row of a held session, with the session's `scheduledAt`. There is no note here:
 * a note is about a child and never goes into a report, so the repository does not even load it.
 */
export interface StatAttendance {
  studentId: string;
  sessionId: string;
  scheduledAt: Date;
  status: 'present' | 'absent';
  performanceRating: number | null;
  /** null means there was no homework: it is never counted. */
  homeworkRating: number | null;
}

/** A student cycle that is in progress or Due. */
export interface StatCycle {
  studentId: string;
  status: Extract<CycleStatus, 'in_progress' | 'due'>;
  sessionsCounted: number;
  sessionsPerCycle: number;
  cycleNumber: number;
}

export interface StudentStatsInput {
  students: readonly StatStudent[];
  /** Every enrollment of every student. */
  enrollments: readonly StatEnrollment[];
  /** The attendance of the students, over all time (the streak looks back beyond the period). */
  attendance: readonly StatAttendance[];
  cycles: readonly StatCycle[];
  /** Academy-local dates, both included. */
  period: { from: string; to: string };
  zone: string;
}

export interface StudentStats {
  granularity: ReportGranularity;
  kpis: StudentsReportKpis;
  buckets: StudentsBucket[];
  rows: StudentsReportRow[];
}

/**
 * The KPIs, buckets and rows of the students report, as a pure function: the repository loads, this
 * decides. No query, no clock; the period and the zone are inputs.
 *
 * Which day an attendance row belongs to is the academy-local date of its session's scheduled_at
 * (never a UTC slice), so a 23:30 session lands on its own day.
 *
 * Absence streak: sort a student's attendance by scheduled_at, newest first, and count the absent
 * rows until the first present one. It looks at all time and ignores the period on purpose: whether
 * a child has missed three sessions in a row right now does not depend on which month is being read.
 * A present row resets it.
 *
 * Rows: every student with an open enrollment, plus any student with an attendance row in the
 * period; a former student without attendance in the period is not listed. Ordered by name.
 */
export function buildStudentStats(input: StudentStatsInput): StudentStats {
  const { period, zone } = input;
  const granularity = granularityOf(period);
  const inPeriod = (date: string) => date >= period.from && date <= period.to;

  const enrollmentsOf = new Map<string, StatEnrollment[]>();
  for (const enrollment of input.enrollments) {
    const list = enrollmentsOf.get(enrollment.studentId) ?? [];
    list.push(enrollment);
    enrollmentsOf.set(enrollment.studentId, list);
  }

  let activeStudents = 0;
  let joined = 0;
  let left = 0;
  for (const list of enrollmentsOf.values()) {
    const open = list.some((enrollment) => enrollment.endDate === null);
    if (open) activeStudents += 1;
    const first = list.reduce((a, b) => (b.startDate < a.startDate ? b : a));
    if (inPeriod(first.startDate)) joined += 1;
    // The latest enrollment is the one that started last; a student with an open one has not left.
    const latest = list.reduce((a, b) => (b.startDate > a.startDate ? b : a));
    if (!open && latest.endDate !== null && inPeriod(latest.endDate)) left += 1;
  }

  const attendanceOf = new Map<string, StatAttendance[]>();
  for (const row of input.attendance) {
    const list = attendanceOf.get(row.studentId) ?? [];
    list.push(row);
    attendanceOf.set(row.studentId, list);
  }
  const cycleOf = new Map<string, StatCycle>();
  for (const cycle of input.cycles) {
    const current = cycleOf.get(cycle.studentId);
    if (!current || prefers(cycle, current)) cycleOf.set(cycle.studentId, cycle);
  }

  const buckets: StudentsBucket[] = bucketKeys(period, granularity).map((key) => ({
    key,
    present: 0,
    absent: 0,
  }));
  const bucketOf = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  const rows: StudentsReportRow[] = [];
  const periodRatings = { performance: [] as number[], homework: [] as number[] };
  let present = 0;
  let absent = 0;

  for (const student of input.students) {
    const enrollments = enrollmentsOf.get(student.id) ?? [];
    const open = enrollments.find((enrollment) => enrollment.endDate === null);
    const history = [...(attendanceOf.get(student.id) ?? [])].sort(
      (a, b) =>
        b.scheduledAt.getTime() - a.scheduledAt.getTime() || b.sessionId.localeCompare(a.sessionId),
    );
    const inThePeriod = history.filter((row) => inPeriod(localDateOf(row.scheduledAt, zone)));
    if (!open && inThePeriod.length === 0) continue;

    let studentPresent = 0;
    let studentAbsent = 0;
    const performance: number[] = [];
    const homework: number[] = [];
    for (const row of inThePeriod) {
      if (row.status === 'present') studentPresent += 1;
      else studentAbsent += 1;
      if (row.performanceRating !== null) performance.push(row.performanceRating);
      if (row.homeworkRating !== null) homework.push(row.homeworkRating);
      const bucket = bucketOf.get(bucketKeyOf(localDateOf(row.scheduledAt, zone), granularity));
      if (bucket) bucket[row.status] += 1;
    }
    present += studentPresent;
    absent += studentAbsent;
    periodRatings.performance.push(...performance);
    periodRatings.homework.push(...homework);

    let absenceStreak = 0;
    for (const row of history) {
      if (row.status !== 'absent') break;
      absenceStreak += 1;
    }
    const lastPresent = history.find((row) => row.status === 'present');
    const cycle = cycleOf.get(student.id);

    rows.push({
      studentId: student.id,
      name: student.name,
      isActive: student.isActive,
      currentGroup: open ? { id: open.group.id, name: open.group.name } : null,
      present: studentPresent,
      absent: studentAbsent,
      attendanceRate: percentage(studentPresent, studentPresent + studentAbsent),
      absenceStreak,
      lastPresentAt: lastPresent ? lastPresent.scheduledAt.toISOString() : null,
      averagePerformance: average(performance),
      averageHomework: average(homework),
      cycle: cycle
        ? {
            sessionsCounted: cycle.sessionsCounted,
            sessionsPerCycle: cycle.sessionsPerCycle,
            status: cycle.status,
          }
        : null,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));

  return {
    granularity,
    kpis: {
      activeStudents,
      joined,
      left,
      present,
      absent,
      attendanceRate: percentage(present, present + absent),
      averagePerformance: average(periodRatings.performance),
      averageHomework: average(periodRatings.homework),
      repeatedAbsence: rows.filter((row) => row.absenceStreak >= REPEATED_ABSENCE_THRESHOLD).length,
    },
    buckets,
    rows,
  };
}

/** The cycle in progress wins over a Due one; among Due ones the latest (highest number) wins. */
function prefers(candidate: StatCycle, current: StatCycle): boolean {
  if (candidate.status !== current.status) return candidate.status === 'in_progress';
  return candidate.cycleNumber > current.cycleNumber;
}

/** Percent with one decimal, in integer math; null when there is nothing to divide. */
function percentage(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part * 1000) / whole) / 10;
}

/** Mean with one decimal, in integer math; null when there is nothing to average. */
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total * 10) / values.length) / 10;
}
