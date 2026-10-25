import { useState } from 'react';
import type { Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog, FormField } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatDateTime, zonedDateAndTime, zonedInstantUtc } from '@/lib/format';
import { useRescheduleSession } from '../hooks/useRescheduleSession';
import { canWriteSession } from './session-access';

/**
 * Changes the time of a Scheduled session (US-15). The date and the time are the academy's local
 * wall clock, not the browser's: they are turned into a UTC instant with the academy's timezone,
 * so Egypt's daylight saving time is handled. The session stays Scheduled and keeps its
 * occurrence; the new time is not checked here (the API decides).
 */
export function RescheduleSessionButton({ session }: { session: Session }) {
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const move = useRescheduleSession(session.id);
  // An open dialog stays until it is closed, even when the session stops being Scheduled
  // underneath it (marked Held by someone else): the person reads why instead of it vanishing.
  if (
    !canWriteSession(session, me.data?.id, can, scopeFor('sessions.update')) ||
    (session.status !== 'scheduled' && !open)
  ) {
    return null;
  }

  const fieldError = move.error?.fieldErrors.scheduledAt;
  const complete = date !== '' && time !== '';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const current = zonedDateAndTime(session.scheduledAt, timeZone);
          setDate(current.date);
          setTime(current.time);
        } else {
          move.reset();
        }
      }}
      trigger={
        <Button variant="outline" aria-label={'غيّر ميعاد حصة ' + session.group.name}>
          غيّر الميعاد
        </Button>
      }
      title="تغيّر ميعاد الحصة؟"
      description={'الميعاد الحالي: ' + formatDateTime(session.scheduledAt, timeZone)}
      confirmLabel="غيّر الميعاد"
      busy={move.isPending}
      onConfirm={() => {
        if (!complete) return;
        move.mutate(zonedInstantUtc(date, time, timeZone).toISOString(), {
          onSuccess: () => setOpen(false),
        });
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="التاريخ"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={fieldError}
        />
        <FormField
          label="الساعة"
          type="time"
          required
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        {move.isError && !fieldError && <Alert variant="danger">{move.error.message}</Alert>}
      </div>
    </ConfirmDialog>
  );
}
