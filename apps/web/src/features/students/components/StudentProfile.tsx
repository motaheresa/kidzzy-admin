import { PencilIcon, UserXIcon } from 'lucide-react';
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
import { useStudent } from '../hooks/useStudents';
import { DeactivateStudentButton } from './DeactivateStudentButton';
import { StudentStatusBadge } from './StudentStatusBadge';

/**
 * One student's profile (wireframe "Admin · Student"): name, code and current group, then the
 * data card. The cycle, group history, payments and attendance sections arrive with their stories.
 */
export function StudentProfile({ id }: { id: string }) {
  const student = useStudent(id);
  const { can } = usePermissions();

  if (student.isPending) {
    return (
      <div className="grid gap-4" aria-label="جاري التحميل">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (student.isError) {
    return student.error.kind === 'notFound' ? (
      <EmptyState
        icon={<UserXIcon aria-hidden="true" />}
        title="الطالب ده مش موجود"
        action={
          <Button asChild variant="outline">
            <Link to="/students">ارجع للطلاب</Link>
          </Button>
        }
      />
    ) : (
      <Alert variant="danger">{student.error.message}</Alert>
    );
  }

  const data = student.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr">{data.code}</span>
            <span aria-hidden="true">·</span>
            <span>{data.currentGroup ? `في ${data.currentGroup.name} دلوقتي` : 'مش في جروب'}</span>
            <StudentStatusBadge isActive={data.isActive} />
          </span>
        }
        actions={
          can('students.manage') && (
            <>
              <Button asChild variant="outline">
                <Link to={`/students/${data.id}/edit`}>
                  <PencilIcon aria-hidden="true" />
                  تعديل البيانات
                </Link>
              </Button>
              {data.isActive && <DeactivateStudentButton student={data} />}
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
              { label: 'السن', value: data.age },
              { label: 'الكود', value: data.code, dir: 'ltr' },
              { label: 'ولي الامر', value: data.parentName },
              { label: 'رقم ولي الامر', value: data.parentPhone, dir: 'ltr' },
              { label: 'ملاحظات', value: data.notes },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
