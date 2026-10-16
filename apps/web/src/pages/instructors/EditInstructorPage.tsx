import { useParams } from 'react-router';
import { Card, CardContent, PageHeader } from '@/components/ui';
import { EditInstructorForm } from '@/features/instructors';

/** /instructors/:id/edit: edit an instructor's name, email and phone. Composition only. */
export function EditInstructorPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="تعديل بيانات المدرس" />
      <Card>
        <CardContent>
          <EditInstructorForm key={id} id={id} />
        </CardContent>
      </Card>
    </div>
  );
}
