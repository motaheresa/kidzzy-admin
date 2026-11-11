import { useState } from 'react';
import type { Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useUpdateSessionTimes } from '../hooks/useUpdateSessionTimes';
import { actualClockTimes, plannedTimes } from '../lib/actual-times';
import { ActualTimesFields } from './ActualTimesFields';
import { canWriteSession } from './session-access';

/**
 * Corrects when a Held session really started and ended (SCRUM-80), for whoever may mark it Held:
 * the instructor on the session, or the admin. It opens with the times already recorded, or the
 * planned ones for a session held before the times existed. The API decides again, and its refusal
 * shows under the field.
 */
export function EditActualTimesButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const update = useUpdateSessionTimes(session.id);
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  if (
    session.status !== 'held' ||
    !canWriteSession(session, me.data?.id, can, scopeFor('sessions.update'))
  ) {
    return null;
  }

  const startedError = update.error?.fieldErrors.startedAt;
  const endedError = update.error?.fieldErrors.endedAt;
  const otherError = update.isError && !startedError && !endedError;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const start = actualClockTimes(session, timeZone) ?? plannedTimes(session, timeZone);
          setStartedAt(start.startedAt);
          setEndedAt(start.endedAt);
        } else {
          update.reset();
        }
      }}
      trigger={
        <Button
          variant="link"
          className="h-auto min-h-11 px-0 text-sm"
          aria-label={session.actualStartedAt ? 'عدّل الوقت الفعلي' : 'سجّل الوقت الفعلي'}
        >
          {session.actualStartedAt ? 'عدّل' : 'سجّل'}
        </Button>
      }
      title="الوقت الفعلي للحصة"
      description="امتى الحصة بدأت وامتى خلصت فعلا؟"
      confirmLabel="احفظ"
      busy={update.isPending}
      onConfirm={() => {
        if (!startedAt || !endedAt) return;
        update.mutate({ startedAt, endedAt }, { onSuccess: () => setOpen(false) });
      }}
    >
      <ActualTimesFields
        scheduledAt={session.scheduledAt}
        timeZone={timeZone}
        startedAt={startedAt}
        endedAt={endedAt}
        onStartedAt={setStartedAt}
        onEndedAt={setEndedAt}
        startedAtError={startedError}
        endedAtError={endedError}
      />
      {otherError && <Alert variant="danger">{update.error.message}</Alert>}
    </ConfirmDialog>
  );
}
