import { PageHeader } from '@/components/ui';
import { StudentsList } from '@/features/students';

/** /students: the students list. Composition only. */
export function StudentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الطلاب" description="طلاب الأكاديمية وبيانات أولياء الأمور" />
      <StudentsList />
    </div>
  );
}
