import { Alert, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useGroup } from '../hooks/useGroups';
import { GroupDetailsForm } from './GroupDetailsForm';
import { GroupScheduleForm } from './GroupScheduleForm';

/**
 * Editing a group (US-10): its details and its weekly schedule, saved separately because the
 * schedule rebuilds sessions. An instructor who opens another instructor's group gets the API's
 * 403 here.
 */
export function EditGroupForm({ id }: { id: string }) {
  const group = useGroup(id);

  if (group.isPending) return <Skeleton className="h-96 w-full" />;
  if (group.isError) return <Alert variant="danger">{group.error.message}</Alert>;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>بيانات الجروب</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupDetailsForm group={group.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>المواعيد الاسبوعية</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupScheduleForm group={group.data} />
        </CardContent>
      </Card>
    </div>
  );
}
