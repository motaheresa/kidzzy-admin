import { Injectable } from '@nestjs/common';
import type { Dashboard } from '@kidzzy/shared';
import { AcademyRepository } from '../academies/academy.repository';
import { Clock } from '../sessions/clock';
import { addDays, localDateOf, occurrenceInstant } from '../sessions/occurrences';
import { toSession } from '../sessions/session.mapper';
import { toDueCycle, toHeldSession } from './dashboard.mapper';
import { DashboardRepository } from './dashboard.repository';

/** How many Held sessions the dashboard shows. */
export const RECENT_HELD_LIMIT = 10;
/** How many due cycles each list shows; the count above them is not capped. */
export const DUE_LIST_LIMIT = 20;
/** "This week" is this many academy-local days, today included. */
export const WEEK_DAYS = 7;

/**
 * What the admin sees first (US-34). "Today" and "this week" are academy-local: the academy's
 * IANA zone turns local midnights into instants (DST-safe), and the injectable Clock gives "now".
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboard: DashboardRepository,
    private readonly academies: AcademyRepository,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<Dashboard> {
    const zone = await this.academies.findTimezone();
    const now = this.clock.now();
    const today = localDateOf(now, zone);
    const dayStart = occurrenceInstant(today, '00:00', zone);
    const dayEnd = occurrenceInstant(addDays(today, 1), '00:00', zone);
    const weekStart = occurrenceInstant(addDays(today, 1 - WEEK_DAYS), '00:00', zone);

    const [
      todayRows,
      cancelledThisWeek,
      unmarked,
      held,
      students,
      instructors,
      studentsDue,
      instructorsDue,
    ] = await Promise.all([
      this.dashboard.listSessionsBetween(dayStart, dayEnd),
      this.dashboard.countCancelledBetween(weekStart, dayEnd),
      this.dashboard.countUnmarked(now),
      this.dashboard.listRecentHeld(RECENT_HELD_LIMIT),
      this.dashboard.listDueCycles('student', DUE_LIST_LIMIT),
      this.dashboard.listDueCycles('instructor', DUE_LIST_LIMIT),
      this.dashboard.countDueCycles('student'),
      this.dashboard.countDueCycles('instructor'),
    ]);
    const attendance = await this.dashboard.countAttendance(held.map((row) => row.id));

    return {
      counts: {
        sessionsToday: todayRows.filter((row) => row.status !== 'cancelled').length,
        dueCycles: studentsDue + instructorsDue,
        cancelledThisWeek,
        unmarked,
      },
      todaySessions: todayRows.map(toSession),
      recentHeld: held.map((row) => toHeldSession(row, attendance.get(row.id))),
      dueCycles: { students: students.map(toDueCycle), instructors: instructors.map(toDueCycle) },
    };
  }
}
