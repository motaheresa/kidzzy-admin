import { useParams } from 'react-router';
import { Card, CardContent, PageHeader } from '@/components/ui';
import { EditStudentForm } from '@/features/students';

/** /students/:id/edit: edit a student's data. Composition only. */
export function EditStudentPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="تعديل بيانات الطالب" />
      <Card>
        <CardContent>
          <EditStudentForm key={id} id={id} />
        </CardContent>
      </Card>
    </div>
  );
}
