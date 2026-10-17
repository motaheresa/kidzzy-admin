import type { ScheduleSlot } from '@kidzzy/shared';

// Pure rules for a group's weekly schedule (no database, no framework), so they are unit-tested.

export const MINUTES_PER_DAY = 24 * 60;
export const MIN_DURATION = 15;
export const MAX_DURATION = 240;
export const MAX_SLOTS = 14;
/** "HH:MM", 00:00 to 23:59 */
export const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "16:30" -> 990 */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Weekday first (Sunday is 0), then time. Returns a new array. */
export function sortSlots(slots: readonly ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort(
    (a, b) => a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime),
  );
}

export type ScheduleProblem = 'overlap' | 'past-midnight';

/**
 * The first problem in a schedule, or null when it is fine (the DTO already checked each slot's
 * own shape):
 * - past-midnight: a slot ends after 24:00, so it would spill into the next weekday;
 * - overlap: two slots of the same weekday share time. A slot that starts exactly when another
 *   ends is fine (back to back).
 * An identical pair counts as an overlap too.
 */
export function findScheduleProblem(slots: readonly ScheduleSlot[]): ScheduleProblem | null {
  const sorted = sortSlots(slots);
  for (const slot of sorted) {
    if (toMinutes(slot.startTime) + slot.durationMin > MINUTES_PER_DAY) return 'past-midnight';
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (
      previous.weekday === current.weekday &&
      toMinutes(previous.startTime) + previous.durationMin > toMinutes(current.startTime)
    ) {
      return 'overlap';
    }
  }
  return null;
}

/** Two slots are the same meeting when weekday, start time and length match. */
export function sameSlot(a: ScheduleSlot, b: ScheduleSlot): boolean {
  return a.weekday === b.weekday && a.startTime === b.startTime && a.durationMin === b.durationMin;
}

/** A Postgres TIME value as Prisma returns it (a Date on 1970-01-01, UTC) -> "HH:MM". */
export function timeToString(time: Date): string {
  return time.toISOString().slice(11, 16);
}

/** "HH:MM" -> the Date Prisma writes to a TIME column. */
export function stringToTime(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

/** What replacing a group's schedule does to its slot rows. */
export interface ScheduleDiff<S extends ScheduleSlot & { id: string; retired: boolean }> {
  /** In use before and after: same row, same sessions (a single reschedule on it survives). */
  keep: S[];
  /** Retired before, back in the schedule: the row is used again. */
  revive: S[];
  /** In use before, gone now: its future Scheduled sessions go, and the row is deleted or retired. */
  remove: S[];
  /** In neither: new rows. */
  add: ScheduleSlot[];
}

/**
 * Matches the new schedule against the group's slot rows by weekday, start time and duration.
 * A slot that did not change keeps its row, so the sessions already generated for it (and any
 * reschedule of one of them) stay; only what really changed is rebuilt (AC of US-10). Retired
 * rows are matched too, so a slot that comes back reuses its row instead of duplicating its days.
 */
export function diffSchedule<S extends ScheduleSlot & { id: string; retired: boolean }>(
  existing: readonly S[],
  incoming: readonly ScheduleSlot[],
): ScheduleDiff<S> {
  const used = new Set<string>();
  const keep: S[] = [];
  const revive: S[] = [];
  const add: ScheduleSlot[] = [];
  for (const slot of incoming) {
    // Prefer a row that is in use over a retired one with the same shape.
    const match =
      existing.find((row) => !used.has(row.id) && !row.retired && sameSlot(row, slot)) ??
      existing.find((row) => !used.has(row.id) && row.retired && sameSlot(row, slot));
    if (!match) {
      add.push(slot);
      continue;
    }
    used.add(match.id);
    (match.retired ? revive : keep).push(match);
  }
  const remove = existing.filter((row) => !row.retired && !used.has(row.id));
  return { keep, revive, remove, add };
}
