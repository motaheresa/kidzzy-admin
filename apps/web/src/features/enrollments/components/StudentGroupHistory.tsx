import { ArrowLeftRightIcon, UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
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
import { useStudentEnrollments } from '../hooks/useStudentEnrollments';

/**
 * A student's groups over time (US-09), the latest first, with the days of each (both included).
 * Whoever holds enrollments.manage gets the transfer button while the student is in a group.
 */
export function StudentGroupHistory({ studentId }: { studentId: string }) {
  const enrollments = useStudentEnrollments(studentId);
  const { can } = usePermissions();
  const inGroup = enrollments.data?.some((enrollment) => enrollment.endDate === null) ?? false;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>الجروبات</CardTitle>
        {inGroup && can('enrollments.manage') && (
          <Button asChild variant="outline">
            <Link to={`/students/${studentId}/transfer`}>
              <ArrowLeftRightIcon aria-hidden="true" />
              نقل لجروب تاني
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {enrollments.isPending ? (
          <Skeleton className="h-16 w-full" aria-label="جاري التحميل" />
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
            icon={<UsersIcon aria-hidden="true" />}
            title="الطالب ده ما اتسجلش في اي جروب لسه"
            className="py-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الجروب</TableHead>
                <TableHead>من</TableHead>
                <TableHead>لحد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.data.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell className="font-medium">
                    {can('groups.read') ? (
                      <Link
                        to={`/groups/${enrollment.group.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {enrollment.group.name}
                      </Link>
                    ) : (
                      enrollment.group.name
                    )}
                  </TableCell>
                  <TableCell>{formatDate(enrollment.startDate)}</TableCell>
                  <TableCell>
                    {enrollment.endDate ? (
                      formatDate(enrollment.endDate)
                    ) : (
                      <Badge variant="success">لحد دلوقتي</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
