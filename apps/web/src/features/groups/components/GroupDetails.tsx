import { CalendarIcon, PencilIcon, UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DetailList,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { useGroup } from '../hooks/useGroups';
import { formatDuration, formatSlot } from '../schedule-format';
import { GroupStatusBadge } from './GroupStatusBadge';

/**
 * One group's screen (wireframe "Admin · Group"): name, level, instructor and start date, then
 * the weekly schedule and the numbers. The page puts the group's students under it (enrollments
 * feature); the sessions arrive with their story.
 * An instructor who opens another instructor's group gets the API's 403 here (AC-08).
 */
export function GroupDetails({ id }: { id: string }) {
  const group = useGroup(id);
  const { can } = usePermissions();

  if (group.isPending) {
    return (
      <div className="grid gap-4" aria-label="جاري التحميل">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (group.isError) {
    const error = group.error;
    return error.kind === 'notFound' || error.kind === 'forbidden' ? (
      <EmptyState
        icon={<UsersIcon aria-hidden="true" />}
        title={error.kind === 'notFound' ? 'الجروب ده مش موجود' : 'الجروب ده مش بتاعك'}
        description={error.kind === 'forbidden' ? 'تقدر تشوف الجروبات اللي بتدرسها بس.' : undefined}
        action={
          <Button asChild variant="outline">
            <Link to="/groups">ارجع للجروبات</Link>
          </Button>
        }
      />
    ) : (
      <Alert variant="danger">{error.message}</Alert>
    );
  }

  const data = group.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr">{data.level}</span>
            <span aria-hidden="true">·</span>
            <span>المدرس: {data.instructor.name}</span>
            <span aria-hidden="true">·</span>
            <span>بدأ {formatDate(data.startDate)}</span>
            <GroupStatusBadge isActive={data.isActive} />
          </span>
        }
        actions={
          can('groups.update') && (
            <Button asChild variant="outline">
              <Link to={`/groups/${data.id}/edit`}>
                <PencilIcon aria-hidden="true" />
                تعديل
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>المواعيد الاسبوعية</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {data.schedule.map((slot) => (
                <li
                  key={`${slot.weekday}-${slot.startTime}`}
                  className="flex items-center gap-2 text-foreground"
                >
                  <CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span>{formatSlot(slot)}</span>
                  <span className="text-sm text-muted-foreground">
                    ({formatDuration(slot.durationMin)})
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملخص</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: 'السيشنات اللي اتعملت', value: formatNumber(data.heldCount) },
                { label: 'عدد الطلاب', value: formatNumber(data.studentCount) },
                {
                  label: 'السيشن الجاية',
                  value: data.nextSessionAt ? formatDateTime(data.nextSessionAt) : null,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
