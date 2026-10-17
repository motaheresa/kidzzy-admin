import { useState, type FormEvent } from 'react';
import { Alert, Button, ConfirmDialog } from '@/components/ui';
import { useReplaceSchedule } from '../hooks/useGroupMutations';
import { sameSlot, sortSlots } from '../schedule-format';
import { draftsToSlots, slotsToDrafts, type SlotDraft } from '../slot-draft';
import type { Group } from '../types';
import { ScheduleEditor } from './ScheduleEditor';

/**
 * The weekly schedule (US-10), with the same editor as the create form. Saving asks first: the
 * future Scheduled sessions are rebuilt from the new schedule (only what changed), while the
 * sessions that were held or cancelled stay as they are. The API's answer (an overlap, a bad
 * time) shows under the editor and its rows.
 */
export function GroupScheduleForm({ group }: { group: Group }) {
  const replace = useReplaceSchedule(group.id);
  const [slots, setSlots] = useState<SlotDraft[]>(() => slotsToDrafts(group.schedule));
  const [confirm, setConfirm] = useState(false);

  const next = sortSlots(draftsToSlots(slots));
  const changed =
    next.length !== group.schedule.length ||
    next.some((slot, index) => !sameSlot(slot, group.schedule[index]));

  function submit(event: FormEvent) {
    event.preventDefault();
    setConfirm(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <ScheduleEditor slots={slots} onChange={setSlots} errors={replace.error?.fieldErrors} />

      {replace.error && !replace.error.fieldErrors.schedule && (
        <Alert variant="danger">{replace.error.message}</Alert>
      )}

      <Button type="submit" className="self-start" disabled={!changed}>
        حفظ المواعيد
      </Button>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="تغيير المواعيد؟"
        description="السيشنات الجاية هتتعمل من جديد على المواعيد الجديدة، والسيشنات اللي اتعملت او اتلغت مش هتتغير."
        confirmLabel="ايوه، غيّر المواعيد"
        busy={replace.isPending}
        onConfirm={() => replace.mutate(next, { onSettled: () => setConfirm(false) })}
      />
    </form>
  );
}
