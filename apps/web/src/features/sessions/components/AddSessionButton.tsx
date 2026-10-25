import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Alert, Button, ConfirmDialog, FormField, SelectField } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useGroup } from '@/features/groups';
import { formatDateTime, localToday, zonedInstantUtc } from '@/lib/format';
import { useCreateSession } from '../hooks/useCreateSession';
import { useSessions } from '../hooks/useSessions';

const LIST_SIZE = 100;
const DEFAULT_DURATION = 60;

/**
 * "Add session" on a group's sessions (US-16): an extra session, or a make-up for a Cancelled
 * one. The date and the time are the academy's wall clock, turned into a UTC instant with its
 * timezone; the duration starts at the group's usual one. The "compensates" list offers the
 * group's Cancelled sessions that have no make-up yet (BR-04: one make-up per cancelled session).
 * Scope `own` sees the action only on a group they teach now. The API decides again.
 */
export function AddSessionButton({ groupId }: { groupId: string }) {
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const group = useGroup(groupId);
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [compensates, setCompensates] = useState('');
  const create = useCreateSession(groupId);
  // Only while the dialog is open: the two lists are not needed otherwise.
  const cancelled = useSessions(
    { page: 1, pageSize: LIST_SIZE, groupId, status: 'cancelled' },
    open,
  );
  const makeups = useSessions({ page: 1, pageSize: LIST_SIZE, groupId, isMakeup: true }, open);

  const data = group.data;
  if (
    !data ||
    !data.isActive ||
    !can('sessions.update') ||
    (scopeFor('sessions.update') === 'own' && data.instructor.id !== me.data?.id)
  ) {
    return null;
  }

  const taken = new Set((makeups.data?.data ?? []).map((item) => item.compensatesSessionId));
  const offered = (cancelled.data?.data ?? []).filter((item) => !taken.has(item.id));
  const minutes = Number(duration);
  const complete =
    date !== '' && time !== '' && Number.isInteger(minutes) && minutes >= 15 && minutes <= 240;
  const errors = create.error?.fieldErrors ?? {};
  const fieldError = errors.scheduledAt ?? errors.durationMin ?? errors.compensatesSessionId;
  const usualDuration = data.schedule[0]?.durationMin ?? DEFAULT_DURATION;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDate(localToday(timeZone));
          setTime('');
          setDuration(String(usualDuration));
          setCompensates('');
        } else {
          create.reset();
        }
      }}
      trigger={
        <Button variant="outline" aria-label={'ضيف حصة ' + data.name}>
          <PlusIcon aria-hidden="true" />
          ضيف حصة
        </Button>
      }
      title="ضيف حصة"
      description="حصة تعويضية عن حصة اتلغت، او حصة اضافية. بتتحسب في الدورات زي اي حصة لما تتسجل."
      confirmLabel="ضيف الحصة"
      busy={create.isPending}
      onConfirm={() => {
        if (!complete) return;
        create.mutate(
          {
            scheduledAt: zonedInstantUtc(date, time, timeZone).toISOString(),
            durationMin: minutes,
            ...(compensates ? { compensatesSessionId: compensates } : {}),
          },
          { onSuccess: () => setOpen(false) },
        );
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="التاريخ"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <FormField
          label="الساعة"
          type="time"
          required
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <FormField
          label="المدة (دقيقة)"
          type="number"
          inputMode="numeric"
          min={15}
          max={240}
          required
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          error={errors.durationMin}
        />
        <SelectField
          label="بتعوّض عن"
          hint="اختياري. من غير اختيار بتبقى حصة اضافية"
          value={compensates}
          onChange={(event) => setCompensates(event.target.value)}
          error={errors.compensatesSessionId}
        >
          <option value="">حصة اضافية (من غير تعويض)</option>
          {offered.map((item) => (
            <option key={item.id} value={item.id}>
              {formatDateTime(item.scheduledAt, timeZone)}
            </option>
          ))}
        </SelectField>
        {create.isError && !fieldError && <Alert variant="danger">{create.error.message}</Alert>}
        {errors.scheduledAt && <Alert variant="danger">{errors.scheduledAt}</Alert>}
      </div>
    </ConfirmDialog>
  );
}
