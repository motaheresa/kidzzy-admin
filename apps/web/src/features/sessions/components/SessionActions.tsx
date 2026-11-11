import type { Session } from '@kidzzy/shared';
import { CancelSessionButton } from './CancelSessionButton';
import { MarkHeldButton } from './MarkHeldButton';
import { RescheduleSessionButton } from './RescheduleSessionButton';

/**
 * The actions on a session in a list: mark it Held, reschedule it, cancel it. Each button shows
 * itself only when the caller may do it and the session's status allows it; the API decides again.
 */
export function SessionActions({ session }: { session: Session }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <MarkHeldButton session={session} />
      <RescheduleSessionButton session={session} />
      <CancelSessionButton session={session} />
    </span>
  );
}
