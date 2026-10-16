import { Alert, Skeleton } from '@/components/ui';
import { useStudent } from '../hooks/useStudents';
import { useUpdateStudent } from '../hooks/useStudentMutations';
import { StudentForm } from './StudentForm';

/** Editing a student: the form starts from the saved values; an emptied age or notes sends null. */
export function EditStudentForm({ id }: { id: string }) {
  const student = useStudent(id);
  const update = useUpdateStudent(id);

  if (student.isPending) return <Skeleton className="h-96 w-full" />;
  if (student.isError) return <Alert variant="danger">{student.error.message}</Alert>;

  const saved = student.data;
  return (
    <StudentForm
      initial={{
        code: saved.code,
        name: saved.name,
        age: saved.age === null ? '' : String(saved.age),
        parentName: saved.parentName,
        parentPhone: saved.parentPhone,
        notes: saved.notes ?? '',
      }}
      submitLabel="حفظ"
      pending={update.isPending}
      error={update.error}
      onSubmit={(values) => update.mutate(values)}
    />
  );
}
