import { useCreateStudent } from '../hooks/useStudentMutations';
import { StudentForm } from './StudentForm';

/** The new-student form: an empty age or notes is left out of the body. */
export function CreateStudentForm() {
  const create = useCreateStudent();
  return (
    <StudentForm
      submitLabel="اضافة الطالب"
      pending={create.isPending}
      error={create.error}
      onSubmit={({ age, notes, ...required }) =>
        create.mutate({
          ...required,
          ...(age === null ? {} : { age }),
          ...(notes === null ? {} : { notes }),
        })
      }
    />
  );
}
