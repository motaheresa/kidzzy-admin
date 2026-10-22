import { useState } from 'react';
import type { PermissionAction, PermissionScope, Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useMarkHeld } from '../hooks/useMarkHeld';
import { canWriteSession } from './session-access';

/**
 * Whether this caller may mark this session Held from the screen: the write rule, a Scheduled
 * status, and a start time that has already come on the browser clock. The API decides again.
 */
function canMarkHeld(
  session: Session,
  callerId: string | undefined,
  can: (action: PermissionAction) => boolean,
  scope: PermissionScope | null,
  now: Date = new Date(),
): boolean {
  if (!canWriteSession(session, callerId, can, scope)) return false;
  if (session.status !== 'scheduled') return false;
  return new Date(session.scheduledAt).getTime() <= now.getTime();
}

/** Confirms, then marks the session Held. The admin is the only one who can undo it (SCRUM-41). */
export function MarkHeldButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const mark = useMarkHeld(session.id);
  if (!canMarkHeld(session, me.data?.id, can, scopeFor('sessions.update'))) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mark.reset();
      }}
      trigger={
        <Button variant="outline" aria-label={`سجّل حصة ${session.group.name} اتعملت`}>
          سجّلها اتعملت
        </Button>
      }
      title="تسجّل الحصة إنها اتعملت؟"
      description="الأدمن بس هو اللي يقدر يرجع التسجيل ده."
      confirmLabel="ايوه، سجّلها"
      busy={mark.isPending}
      onConfirm={() => mark.mutate(undefined, { onSuccess: () => setOpen(false) })}
    >
      {mark.isError && <Alert variant="danger">{mark.error.message}</Alert>}
    </ConfirmDialog>
  );
}
