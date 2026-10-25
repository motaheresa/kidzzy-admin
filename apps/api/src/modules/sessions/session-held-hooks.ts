import { Injectable } from '@nestjs/common';
import type { CycleChange } from '@kidzzy/shared';
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
 * A small registry between sessions and the modules that react to a Held session (today:
 * counting it into payment cycles, US-22, and the attendance recorded for it, US-18). Sessions
 * cannot import those modules, because they already import sessions (enrollments, groups,
 * attendance), so each registers itself here when it starts and SessionsService runs them inside
 * the transaction.
 */
@Injectable()
export class SessionHeldHooks {
  private readonly hooks: SessionHeldHook[] = [];

  register(hook: SessionHeldHook): void {
    this.hooks.push(hook);
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
