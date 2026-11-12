import { addDays, localDateOf, planSessions, type SlotRule } from '../sessions/occurrences';

// The expected money of the part of a report period that is still ahead (US-38). A pure function:
// no database, no clock, no framework, and no arithmetic on money (amounts are decimal strings it
// only hands back, so the service sums them as Decimal). The repository loads the rows, this
// decides which cycles will complete inside the period.
//
// The idea: a cycle is due when it has counted N sessions. Walk the payee's future Scheduled
// sessions in time order; the session that makes the count reach N completes the cycle, and the
// cycle is worth its plan amount when that session falls inside the period. A long period can
// complete the next cycle too, and a plan change applies from the next cycle.
//
// Assumptions, said on the report: nobody joins or leaves and no further session is cancelled.
// A past session that is still Scheduled (nobody marked it) is ignored until it is held.

/** What the next cycles of a payee are made of: the latest plan version. */
export interface PlanTerms {
  sessionsPerCycle: number;
  /** Decimal string in EGP, e.g. "1500.00" */
  amount: string;
}

/**
 * One student, or one (instructor, group) pair, with the cycle now in progress and the latest plan.
 * `groupId` is the group the payee's sessions come from: a student's open enrollment, an
 * instructor pair's group; null when the student has no open enrollment.
 */
export interface ProjectedPayee {
  kind: 'student' | 'instructor';
  groupId: string | null;
  /** Only for an instructor pair: their sessions are the group's sessions they teach. */
  instructorId: string | null;
  /** The cycle in progress, with the amount of the plan version it started under; null if none. */
  open: { sessionsPerCycle: number; sessionsCounted: number; amount: string } | null;
  /** The latest plan version; null when the payee has no plan. */
  next: PlanTerms | null;
}

/** A Scheduled session that has not started yet (scheduledAt >= now). */
export interface FutureSession {
  groupId: string;
  /** The instructor on the session. */
  instructorId: string;
  at: Date;
}

/** An active group with its active slots (retired ones left out) and its current instructor. */
export interface ProjectionGroup {
  id: string;
  instructorId: string;
  slots: readonly SlotRule[];
}

export interface ProjectionInput {
  /** The period: start inclusive, end exclusive. */
  start: Date;
  end: Date;
  now: Date;
  zone: string;
  /** The last academy-local day (YYYY-MM-DD) the session generator has covered. */
  horizon: string;
  payees: readonly ProjectedPayee[];
  sessions: readonly FutureSession[];
  groups: readonly ProjectionGroup[];
}

/** A cycle that completes inside the period, and what it is worth. */
export interface Completion {
  kind: 'student' | 'instructor';
  amount: string;
  at: Date;
}

export interface Projection {
  completions: Completion[];
  /** Students with no open enrollment or no plan: left out and counted. */
  skippedStudents: number;
  /** (Instructor, group) pairs with no plan: left out and counted. */
  skippedInstructorPairs: number;
}

/**
 * Which cycles complete inside [max(start, now), end), per payee. The part of the period that has
 * already passed is not here: those cycles are already due and are read from their due_at.
 */
export function projectCompletions(input: ProjectionInput): Projection {
  const result: Projection = { completions: [], skippedStudents: 0, skippedInstructorPairs: 0 };
  // Nothing is ahead when the period ended: nothing is projected, so nothing is skipped either.
  if (input.end.getTime() <= input.now.getTime()) return result;

  const lower = input.start.getTime() > input.now.getTime() ? input.start : input.now;
  const timelines = new TimelineCache(input);

  for (const payee of input.payees) {
    if (payee.groupId === null || payee.next === null) {
      if (payee.kind === 'student') result.skippedStudents += 1;
      else result.skippedInstructorPairs += 1;
      continue;
    }
    // A payee with a plan but no cycle in progress takes no session for now: nothing to project.
    if (payee.open === null) continue;

    const timeline = timelines.of(
      payee.groupId,
      payee.kind === 'instructor' ? payee.instructorId : null,
    );
    let position = 0;
    let need = payee.open.sessionsPerCycle - payee.open.sessionsCounted;
    let amount = payee.open.amount;

    for (;;) {
      if (need > 0) {
        position += need;
        // The cycle needs more sessions than are known before the end of the period.
        if (position > timeline.length) break;
        const completesAt = timeline[position - 1];
        if (completesAt.getTime() >= input.end.getTime()) break;
        // Completing before the period starts (a period in the future) only advances the walk.
        if (completesAt.getTime() >= lower.getTime()) {
          result.completions.push({ kind: payee.kind, amount, at: completesAt });
        }
      }
      // The next cycle starts at the latest plan: a plan change applies from the next cycle.
      if (payee.next.sessionsPerCycle < 1) break;
      need = payee.next.sessionsPerCycle;
      amount = payee.next.amount;
    }
  }
  return result;
}

/**
 * The known future sessions of a group, as instants in time order. The generated sessions come
 * from the rows; past the generation horizon the group's active slots are repeated weekly up to
 * the end of the period, taught by the group's current instructor. Inside the horizon the rows are
 * the truth (a Cancelled or moved occurrence already has its row), so slots add nothing there.
 */
class TimelineCache {
  private readonly cache = new Map<string, Date[]>();
  private readonly extended = new Map<string, Date[]>();

  constructor(private readonly input: ProjectionInput) {
    const lastDay = localDateOf(new Date(input.end.getTime() - 1), input.zone);
    const from = addDays(input.horizon, 1);
    for (const group of input.groups) {
      if (from > lastDay || group.slots.length === 0) continue;
      this.extended.set(
        group.id,
        planSessions(group.slots, { from, to: lastDay }, input.zone).map(
          (planned) => planned.scheduledAt,
        ),
      );
    }
  }

  /** `instructorId` limits the timeline to the sessions that instructor teaches (a pair). */
  of(groupId: string, instructorId: string | null): Date[] {
    const key = `${groupId}|${instructorId ?? ''}`;
    const known = this.cache.get(key);
    if (known) return known;

    const generated = this.input.sessions
      .filter(
        (session) =>
          session.groupId === groupId &&
          (instructorId === null || session.instructorId === instructorId),
      )
      .map((session) => session.at);
    const group = this.input.groups.find((candidate) => candidate.id === groupId);
    const taught = instructorId === null || group?.instructorId === instructorId;
    const extra = taught ? (this.extended.get(groupId) ?? []) : [];

    const timeline = [...generated, ...extra].sort((a, b) => a.getTime() - b.getTime());
    this.cache.set(key, timeline);
    return timeline;
  }
}
