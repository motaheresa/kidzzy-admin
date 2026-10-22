import { useState } from 'react';
import type { Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog, TextareaField } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useCancelSession } from '../hooks/useCancelSession';
import { canWriteSession } from './session-access';

const REASON_REQUIRED = 'اكتب سبب الالغاء';

/**
 * Asks for the reason, then cancels a Scheduled session (US-14). Offered before or after the
 * start time. A cancelled session takes no number and no longer holds back the ones after it.
 */
export function CancelSessionButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [blank, setBlank] = useState(false);
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const cancel = useCancelSession(session.id);
  if (
    session.status !== 'scheduled' ||
    !canWriteSession(session, me.data?.id, can, scopeFor('sessions.update'))
  ) {
    return null;
  }

  const reasonError = blank ? REASON_REQUIRED : cancel.error?.fieldErrors.reason;
  const otherError = cancel.isError && !cancel.error.fieldErrors.reason;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          cancel.reset();
          setReason('');
          setBlank(false);
        }
      }}
      trigger={
        <Button variant="outline" aria-label={'الغي حصة ' + session.group.name}>
          الغي الحصة
        </Button>
      }
      title="تلغي الحصة دي؟"
      description="الحصة الملغية مش بتاخد رقم ومش بتتحسب. الأدمن بس هو اللي يقدر يرجّعها."
      confirmLabel="ايوه، الغيها"
      tone="danger"
      busy={cancel.isPending}
      onConfirm={() => {
        if (!reason.trim()) {
          setBlank(true);
          return;
        }
        cancel.mutate(reason.trim(), { onSuccess: () => setOpen(false) });
      }}
    >
      <TextareaField
        label="السبب"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setBlank(false);
        }}
        error={reasonError}
        maxLength={500}
        required
      />
      {otherError && <Alert variant="danger">{cancel.error.message}</Alert>}
    </ConfirmDialog>
  );
}
