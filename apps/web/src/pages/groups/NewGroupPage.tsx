import { Card, CardContent, PageHeader } from '@/components/ui';
import { CreateGroupForm } from '@/features/groups';

/** /groups/new: create a group with its weekly schedule. Composition only. */
export function NewGroupPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="جروب جديد" description="السيشنات هتتعمل لوحدها من المواعيد الاسبوعية." />
      <Card>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
    </div>
  );
}
