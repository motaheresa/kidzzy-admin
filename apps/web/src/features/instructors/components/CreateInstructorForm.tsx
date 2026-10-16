import { useCreateInstructor } from '../hooks/useInstructorMutations';
import { InstructorForm } from './InstructorForm';

/** The new-instructor form: an empty email or phone is left out of the body. */
export function CreateInstructorForm() {
  const create = useCreateInstructor();
  return (
    <InstructorForm
      askPassword
      submitLabel="اضافة المدرس"
      pending={create.isPending}
      error={create.error}
      onSubmit={({ name, email, phone, temporaryPassword }) =>
        create.mutate({
          name,
          temporaryPassword,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        })
      }
    />
  );
}
