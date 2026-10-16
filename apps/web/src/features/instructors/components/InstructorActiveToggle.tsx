import { useState } from 'react';
import { Button, ConfirmDialog } from '@/components/ui';
import { useSetInstructorActive } from '../hooks/useInstructorMutations';
import type { Instructor } from '../types';

/**
 * Deactivate or reactivate an instructor, after a confirmation. Deactivating never deletes:
 * the instructor stops logging in, and their history stays.
 */
export function InstructorActiveToggle({ instructor }: { instructor: Instructor }) {
  const [open, setOpen] = useState(false);
  const setActive = useSetInstructorActive(instructor.id);
  const deactivating = instructor.isActive;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={deactivating ? 'outline' : 'secondary'}>
          {deactivating ? 'ايقاف المدرس' : 'تشغيل المدرس تاني'}
        </Button>
      }
      title={deactivating ? `توقف ${instructor.name}؟` : `ترجع ${instructor.name}؟`}
      description={
        deactivating
          ? 'مش هيقدر يسجل دخول، وهيخرج من كل الاجهزة خلال ربع ساعة. بياناته وتاريخه هيفضلوا زي ما هم.'
          : 'هيقدر يسجل دخول تاني بكلمة السر بتاعته.'
      }
      confirmLabel={deactivating ? 'ايوه، وقفه' : 'ايوه، رجعه'}
      tone={deactivating ? 'danger' : 'primary'}
      busy={setActive.isPending}
      onConfirm={() => setActive.mutate(!deactivating, { onSettled: () => setOpen(false) })}
    />
  );
}
