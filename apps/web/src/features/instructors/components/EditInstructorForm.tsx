import { Alert, Skeleton } from '@/components/ui';
import { useInstructor } from '../hooks/useInstructor';
import { useUpdateInstructor } from '../hooks/useInstructorMutations';
import { InstructorForm } from './InstructorForm';

/** Editing an instructor: the form starts from the saved values; an emptied field sends null. */
export function EditInstructorForm({ id }: { id: string }) {
  const instructor = useInstructor(id);
  const update = useUpdateInstructor(id);

  if (instructor.isPending) return <Skeleton className="h-72 w-full" />;
  if (instructor.isError) return <Alert variant="danger">{instructor.error.message}</Alert>;

  const saved = instructor.data;
  return (
    <InstructorForm
      initial={{ name: saved.name, email: saved.email ?? '', phone: saved.phone ?? '' }}
      submitLabel="حفظ"
      pending={update.isPending}
      error={update.error}
      onSubmit={({ name, email, phone }) =>
        update.mutate({ name, email: email || null, phone: phone || null })
      }
    />
  );
}
