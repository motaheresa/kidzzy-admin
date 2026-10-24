import { useState } from 'react';
import type { Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog } from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { useUndoHeld } from '../hooks/useUndoHeld';

/**
 * Returns a Held session to Scheduled (US-17), for whoever holds sessions.undo_held (the admin).
 * It asks first and says what follows: the session leaves the cycles that counted it, its
 * attendance is deleted and the numbers after it go down by one. The API may refuse (a paid cycle,
 * or a later cycle that already counts sessions: undo the newest first), and the refusal shows in
 * the dialog, which stays open until it is closed even after the session stops being Held.
 */
export function UndoHeldButton({ session }: { session: Session }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const undo = useUndoHeld(session.id);
  if (!can('sessions.undo_held') || (session.status !== 'held' && !open)) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) undo.reset();
      }}
      trigger={<Button variant="outline">رجّع الحصة لمجدولة</Button>}
      title="ترجّع الحصة لمجدولة؟"
      description="هتتشال من الدورات اللي حسبتها، وحضورها وتقييماتها هيتمسحوا، واي حصة بعدها في الجروب رقمها هينزل واحد. لو دورة بعدها بدأت تحسب حصص لازم ترجّع الاحدث الاول."
      confirmLabel="ايوه، رجّعها"
      tone="danger"
      busy={undo.isPending}
      onConfirm={() => undo.mutate(undefined, { onSuccess: () => setOpen(false) })}
    >
      {undo.isError && <Alert variant="danger">{undo.error.message}</Alert>}
    </ConfirmDialog>
  );
}
