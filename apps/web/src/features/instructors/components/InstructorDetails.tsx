import { PencilIcon, UserXIcon, UsersIcon } from 'lucide-react';
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
import { formatDate } from '@/lib/format';
import { useInstructor } from '../hooks/useInstructor';
import { InstructorActiveToggle } from './InstructorActiveToggle';
import { InstructorStatusBadge } from './InstructorStatusBadge';

/** One instructor's screen: header with actions, their data, and their groups. */
export function InstructorDetails({ id }: { id: string }) {
  const instructor = useInstructor(id);
  const { can } = usePermissions();

  if (instructor.isPending) {
    return (
      <div className="grid gap-4" aria-label="جاري التحميل">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (instructor.isError) {
    return instructor.error.kind === 'notFound' ? (
      <EmptyState
        icon={<UserXIcon aria-hidden="true" />}
        title="المدرس ده مش موجود"
        action={
          <Button asChild variant="outline">
            <Link to="/instructors">ارجع للمدرسين</Link>
          </Button>
        }
      />
    ) : (
      <Alert variant="danger">{instructor.error.message}</Alert>
    );
  }

  const data = instructor.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        description={<InstructorStatusBadge isActive={data.isActive} />}
        actions={
          can('instructors.manage') && (
            <>
              <Button asChild variant="outline">
                <Link to={`/instructors/${data.id}/edit`}>
                  <PencilIcon aria-hidden="true" />
                  تعديل البيانات
                </Link>
              </Button>
              <InstructorActiveToggle instructor={data} />
            </>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>البيانات</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: 'الايميل', value: data.email, dir: 'ltr' },
              { label: 'رقم الموبايل', value: data.phone, dir: 'ltr' },
              { label: 'اتضاف في', value: formatDate(data.createdAt) },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الجروبات</CardTitle>
        </CardHeader>
        <CardContent>
          {data.groups.length === 0 ? (
            <EmptyState
              icon={<UsersIcon aria-hidden="true" />}
              title="مفيش جروبات لسه"
              description="الجروبات اللي المدرس بيدرسها هتظهر هنا."
              className="py-6"
            />
          ) : (
            <ul className="grid gap-2">
              {data.groups.map((group) => (
                <li key={group.id}>{group.name}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
