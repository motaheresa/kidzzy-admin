import { useState } from 'react';
import type { Session } from '@kidzzy/shared';
import { Alert, Button, ConfirmDialog, FormField } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useUpdateSessionTopic } from '../hooks/useUpdateSessionTopic';
import { canWriteSession } from './session-access';

const TOPIC_REQUIRED = 'اكتب اللي اتشرح';

/**
 * Corrects what was taught in a Held session (SCRUM-79), for whoever may mark it Held: the
 * instructor on the session, or the admin. A session held before the topic existed gets its topic
 * here. The API decides again.
 */
export function EditTopicButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [blank, setBlank] = useState(false);
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const update = useUpdateSessionTopic(session.id);
  if (
    session.status !== 'held' ||
    !canWriteSession(session, me.data?.id, can, scopeFor('sessions.update'))
  ) {
    return null;
  }

  const topicError = blank ? TOPIC_REQUIRED : update.error?.fieldErrors.topic;
  const otherError = update.isError && !update.error.fieldErrors.topic;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTopic(session.topic ?? '');
        else {
          update.reset();
          setBlank(false);
        }
      }}
      trigger={
        <Button variant="link" className="h-auto min-h-11 px-0 text-sm">
          عدّل
        </Button>
      }
      title="تعدّل اللي اتشرح؟"
      confirmLabel="احفظ"
      busy={update.isPending}
      onConfirm={() => {
        if (!topic.trim()) {
          setBlank(true);
          return;
        }
        update.mutate(topic.trim(), { onSuccess: () => setOpen(false) });
      }}
    >
      <FormField
        label="شرحت ايه النهارده؟"
        value={topic}
        onChange={(event) => {
          setTopic(event.target.value);
          setBlank(false);
        }}
        error={topicError}
        maxLength={300}
        required
      />
      {otherError && <Alert variant="danger">{update.error.message}</Alert>}
    </ConfirmDialog>
  );
}
