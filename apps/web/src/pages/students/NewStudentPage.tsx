import { Card, CardContent, PageHeader } from '@/components/ui';
import { CreateStudentForm } from '@/features/students';

/** /students/new: create a student record. Composition only. */
export function NewStudentPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="طالب جديد" />
      <Card>
        <CardContent>
          <CreateStudentForm />
        </CardContent>
      </Card>
    </div>
  );
}
