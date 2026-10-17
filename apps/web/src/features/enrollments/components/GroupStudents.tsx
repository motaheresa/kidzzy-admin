import { GraduationCapIcon, UserPlusIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDate } from '@/lib/format';
import { useGroupEnrollments } from '../hooks/useGroupEnrollments';

/**
 * A group's current students (US-08), with the date each one joined, and the button that
 * enrolls one (for whoever holds enrollments.manage).
 */
export function GroupStudents({ groupId }: { groupId: string }) {
  const enrollments = useGroupEnrollments(groupId);
  const { can } = usePermissions();

  const enrollButton = can('enrollments.manage') && (
    <Button asChild variant="outline">
      <Link to={`/groups/${groupId}/enroll`}>
        <UserPlusIcon aria-hidden="true" />
        تسجيل طالب
      </Link>
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>الطلاب</CardTitle>
        {enrollButton}
      </CardHeader>
      <CardContent>
        {enrollments.isPending ? (
          <div className="grid gap-2" aria-label="جاري التحميل">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : enrollments.isError ? (
          <Alert variant="danger">
            {enrollments.error.message}{' '}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => void enrollments.refetch()}
            >
              جرب تاني
            </Button>
          </Alert>
        ) : enrollments.data.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon aria-hidden="true" />}
            title="مفيش طلاب في الجروب لسه"
            description="الطلاب هيظهروا هنا لما يتسجلوا في الجروب."
            className="py-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>في الجروب من</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.data.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/students/${enrollment.studentId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {enrollment.studentName}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(enrollment.startDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
