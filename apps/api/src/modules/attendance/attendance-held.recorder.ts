import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  SessionHeldHooks,
  type HeldAttendanceRecord,
  type HeldAttendanceRecorder,
} from '../sessions/session-held-hooks';
import type { SessionRow } from '../sessions/session.repository';
import { AttendanceService } from './attendance.service';

/**
 * Writes the attendance that comes with a Held session (SCRUM-79) inside the Held transaction.
 * It registers itself in SessionHeldHooks, because sessions cannot import attendance (the same
 * pattern as AttendanceUndoHook); the rules stay in AttendanceService.
 */
@Injectable()
export class AttendanceHeldRecorder implements HeldAttendanceRecorder, OnModuleInit {
  constructor(
    private readonly hooks: SessionHeldHooks,
    private readonly attendance: AttendanceService,
  ) {}

  onModuleInit(): void {
    this.hooks.registerRecorder(this);
  }

  recordForHeld(session: SessionRow, records: HeldAttendanceRecord[], at: Date): Promise<void> {
    return this.attendance.recordForHeld(session, records, at);
  }
}
