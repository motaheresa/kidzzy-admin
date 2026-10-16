import { useState } from 'react';
import { Button, ConfirmDialog } from '@/components/ui';
import { useDeactivateStudent } from '../hooks/useStudentMutations';
import type { Student } from '../types';

/** Deactivate a student after a confirmation. Nothing is deleted. */
export function DeactivateStudentButton({ student }: { student: Student }) {
  const [open, setOpen] = useState(false);
  const deactivate = useDeactivateStudent(student.id);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">ايقاف الطالب</Button>}
      title={`توقف ${student.name}؟`}
      description="الطالب هيتشال من الطلاب النشطين. بياناته ومدفوعاته وتاريخه هيفضلوا زي ما هم."
      confirmLabel="ايوه، وقفه"
      tone="danger"
      busy={deactivate.isPending}
      onConfirm={() => deactivate.mutate(undefined, { onSettled: () => setOpen(false) })}
    />
  );
}
