import { CalendarOffIcon } from 'lucide-react';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Pagination,
  Skeleton,
} from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import { STUDENT_ATTENDANCE_PAGE_SIZE } from '../api/attendance.api';
import { useStudentAttendance } from '../hooks/useAttendance';
import { AttendanceMark } from './AttendanceMark';

/**
 * A student's attendance and ratings, newest session first (US-19), paged in the URL.
 * A missing or forbidden student is already explained by the student screen, so this stays
 * quiet then.
 */
export function StudentAttendanceList({ studentId }: { studentId: string }) {
  const { can } = usePermissions();
  const me = useSession();
  const allowed = can('attendance.read');
  const { page, setPage } = useListParams();
  const history = useStudentAttendance(studentId, page, allowed);
  if (!allowed) return null;

  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';

  return (
    <Card>
      <CardHeader>
        <CardTitle>الحضور</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {history.isPending ? (
          <Skeleton className="h-32 w-full" aria-label="جاري التحميل" />
        ) : history.isError ? (
          history.error.kind === 'notFound' || history.error.kind === 'forbidden' ? null : (
            <Alert variant="danger">{history.error.message}</Alert>
          )
        ) : history.data.data.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش حضور متسجل"
            description="الحضور بيظهر بعد ما الحصة تتسجل إنها اتعملت."
          />
        ) : (
          <>
            <ul className="grid gap-2">
              {history.data.data.map((item) => (
                <li
                  key={item.sessionId}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{item.group.name}</span>
                    <span className="numeric text-sm text-muted-foreground">
                      {formatDateTime(item.scheduledAt, timeZone)}
                      {item.sessionNumber !== null && ' · #' + formatNumber(item.sessionNumber)}
                    </span>
                  </span>
                  <AttendanceMark
                    status={item.status}
                    performanceRating={item.performanceRating}
                    homeworkRating={item.homeworkRating}
                  />
                </li>
              ))}
            </ul>
            <Pagination
              page={history.data.meta.page}
              pageSize={STUDENT_ATTENDANCE_PAGE_SIZE}
              total={history.data.meta.total}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
