import { Injectable } from '@nestjs/common';
import type { AttendanceStatus, CycleChange } from '@kidzzy/shared';
import type { SessionRow } from './session.repository';

/**
 * Something that must happen in the same transaction when a session is marked Held, or when that
 * is undone. Each hook implements the ones it cares about.
 */
export interface SessionHeldHook {
  /** Marked Held. Returns the payment cycles it changed (openapi.yaml: HeldResult.cyclesUpdated). */
  onHeld?(session: SessionRow, at: Date): Promise<CycleChange[]>;
  /**
   * Undone (US-17): the session is about to go back to Scheduled. A hook may refuse by throwing,
   * which rolls the whole undo back. `session` is the row as it was while Held.
   */
  onUndone?(session: SessionRow): Promise<void>;
}

/**
 * One student's line of the attendance sent with a Held session. The shape lives here, next to the
 * hook, so sessions never import an attendance DTO. `note` is about a child: it is stored with the
 * attendance and never copied into a notification, a push payload or an audit row.
 */
export interface HeldAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
  note: string | null;
}

/**
 * Writes the attendance sent with a Held session, in the Held transaction. It validates the lines
 * against the session's students and refuses by throwing, which rolls the Held mark back.
 */
export interface HeldAttendanceRecorder {
  recordForHeld(session: SessionRow, records: HeldAttendanceRecord[], at: Date): Promise<void>;
}

/**
 * A small registry between sessions and the modules that react to a Held session (today:
 * counting it into payment cycles, US-22, and the attendance recorded for it, US-18). Sessions
 * cannot import those modules, because they already import sessions (enrollments, groups,
 * attendance), so each registers itself here when it starts and SessionsService runs them inside
 * the transaction.
 */
@Injectable()
export class SessionHeldHooks {
  private readonly hooks: SessionHeldHook[] = [];
  private recorder: HeldAttendanceRecorder | null = null;

  register(hook: SessionHeldHook): void {
    this.hooks.push(hook);
  }

  /** The attendance module registers its recorder here when it starts. There is only one. */
  registerRecorder(recorder: HeldAttendanceRecorder): void {
    this.recorder = recorder;
  }

  /** True once the attendance module has registered its recorder (a test checks it). */
  hasRecorder(): boolean {
    return this.recorder !== null;
  }

  /**
   * Records the attendance as its own step, before `run`, so the order does not depend on which
   * module started first. A session must never become Held with nobody to write its attendance, so
   * a missing recorder is an internal error and the transaction rolls back.
   */
  async recordAttendance(
    session: SessionRow,
    records: HeldAttendanceRecord[],
    at: Date,
  ): Promise<void> {
    if (!this.recorder) throw new Error('No attendance recorder is registered');
    await this.recorder.recordForHeld(session, records, at);
  }

  /** Runs every onHeld in registration order and returns what they changed. */
  async run(session: SessionRow, at: Date): Promise<CycleChange[]> {
    const changes: CycleChange[] = [];
    for (const hook of this.hooks) {
      if (hook.onHeld) changes.push(...(await hook.onHeld(session, at)));
    }
    return changes;
  }

  /** Runs every onUndone in registration order. The first that throws stops the undo. */
  async undo(session: SessionRow): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.onUndone) await hook.onUndone(session);
    }
  }
}
