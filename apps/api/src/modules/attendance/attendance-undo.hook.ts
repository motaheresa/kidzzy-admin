import { Injectable, OnModuleInit } from '@nestjs/common';
import { SessionHeldHooks, type SessionHeldHook } from '../sessions/session-held-hooks';
import type { SessionRow } from '../sessions/session.repository';
import { AttendanceRepository } from './attendance.repository';

/**
 * When a Held session is undone (US-17) the attendance and ratings recorded for it go with it:
 * they described a session that, as far as the system is concerned, did not happen yet. It
 * registers itself in SessionHeldHooks, because sessions cannot import attendance.
 */
@Injectable()
export class AttendanceUndoHook implements SessionHeldHook, OnModuleInit {
  constructor(
    private readonly hooks: SessionHeldHooks,
    private readonly attendance: AttendanceRepository,
  ) {}

  onModuleInit(): void {
    this.hooks.register(this);
  }

  async onUndone(session: SessionRow): Promise<void> {
    await this.attendance.deleteForSession(session.id);
  }
}
