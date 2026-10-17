import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui';
import { EditGroupForm } from '@/features/groups';

/** /groups/:id/edit: edit a group's details and weekly schedule. Composition only. */
export function EditGroupPage() {
  const { id = '' } = useParams();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="تعديل الجروب"
        description="تغيير المواعيد بيعيد بناء السيشنات الجاية بس."
      />
      <EditGroupForm key={id} id={id} />
    </div>
  );
}
