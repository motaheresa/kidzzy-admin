import { Injectable } from '@nestjs/common';
import { Clock } from './clock';
import { SessionRepository } from './session.repository';

/**
 * What changing a group does to its sessions (US-10). Every method works only on sessions that
 * are still ahead AND Scheduled: a Held or Cancelled session, and the past, never change.
 * Call them inside the edit's transaction, after locking the group.
 */
@Injectable()
export class SessionRegeneration {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * The slots left the schedule: their future Scheduled sessions go (they would be wrong). Returns
   * the slots that still have sessions (Held, Cancelled or past), which must be retired, not
   * deleted, so those sessions keep their slot.
   */
  async dropForSlots(slotIds: readonly string[]): Promise<string[]> {
    await this.sessions.deleteFutureScheduled({ slotIds }, this.clock.now());
    return this.sessions.findSlotsInUse(slotIds);
  }

  /** The group was deactivated: its generated future Scheduled sessions go. */
  async dropForGroup(groupId: string): Promise<void> {
    await this.sessions.deleteFutureScheduled({ groupId }, this.clock.now());
  }

  /** Another instructor takes the group: only the sessions still ahead and Scheduled follow. */
  async reassign(groupId: string, instructorId: string): Promise<void> {
    await this.sessions.reassignFutureScheduled(groupId, instructorId, this.clock.now());
  }
}
