import { Injectable } from '@nestjs/common';
import type { CycleChange } from '@kidzzy/shared';
import type { SessionRow } from './session.repository';

/** Something that must happen in the same transaction when a session is marked Held. */
export interface SessionHeldHook {
  /** Returns the payment cycles it changed (openapi.yaml: HeldResult.cyclesUpdated). */
  onHeld(session: SessionRow, at: Date): Promise<CycleChange[]>;
}

/**
 * A small registry between sessions and the modules that react to a Held session (today: counting
 * it into payment cycles, US-22). Sessions cannot import those modules, because they already
 * import sessions (enrollments, groups), so each registers itself here when it starts and
 * SessionsService runs them inside the Held transaction.
 */
@Injectable()
export class SessionHeldHooks {
  private readonly hooks: SessionHeldHook[] = [];

  register(hook: SessionHeldHook): void {
    this.hooks.push(hook);
  }

  /** Runs every hook in registration order and returns what they changed. */
  async run(session: SessionRow, at: Date): Promise<CycleChange[]> {
    const changes: CycleChange[] = [];
    for (const hook of this.hooks) changes.push(...(await hook.onHeld(session, at)));
    return changes;
  }
}
