import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SessionStatus, type Session } from '@kidzzy/shared';
import {
  Alert,
  EmptyState,
  Label,
  PageSizeSelect,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { useGroupOptions } from '@/features/groups';
import { useInstructorOptions } from '@/features/instructors';
import { SessionStatusBadge, useSessions } from '@/features/sessions';
import { formatDate, formatDuration, formatNumber, formatTime } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import { periodInstants, type Period } from '../lib/period';
import { REPORT_PAGE_SIZE } from './FinancePayments';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES = [SessionStatus.Scheduled, SessionStatus.Held, SessionStatus.Cancelled] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  [SessionStatus.Scheduled]: 'مجدولة',
  [SessionStatus.Held]: 'اتعملت',
  [SessionStatus.Cancelled]: 'اتلغت',
};

/**
 * The sessions of the period (US-39), with group, instructor and status filters, a link to each
 * session, and 50 rows per page unless the admin picks 25 or 100. Page, page size and filters are
 * in the URL, next to the period. The period (academy-local dates, both included) goes to
 * GET /sessions as instants: local midnight of the first day up to local midnight after the last.
 */
export function SessionsReportTable({ period, disabled }: { period: Period; disabled: boolean }) {
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const { page, pageSize, setPage, setPageSize, param, setParam } = useListParams({
    pageSize: REPORT_PAGE_SIZE,
  });
  const groups = useGroupOptions();
  const instructors = useInstructorOptions();

  const groupId = groups.data?.data.find((group) => group.id === param('groupId'))?.id;
  // The instructors report links here with the id of any instructor, an inactive one too, and the
  // option list only has the active ones: a well-formed id is kept, and shown as its own option.
  const rawInstructor = param('instructorId');
  const instructorOptions = instructors.data?.data ?? [];
  const instructorId =
    rawInstructor &&
    (instructorOptions.some((item) => item.id === rawInstructor) || UUID.test(rawInstructor))
      ? rawInstructor
      : undefined;
  const instructorIsListed = instructorOptions.some((item) => item.id === instructorId);
  const status = STATUSES.find((value) => value === param('status'));

  const range = periodInstants(period, timeZone);
  const sessions = useSessions(
    { page, pageSize, from: range.from, to: range.to, groupId, instructorId, status },
    !disabled,
  );

  return (
    <section className="flex flex-col gap-3" aria-label="حصص الفترة">
      <h2 className="text-lg font-semibold">حصص الفترة</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-group">المجموعة</Label>
          <Select
            id="report-group"
            value={groupId ?? ''}
            onChange={(event) => setParam('groupId', event.target.value)}
          >
            <option value="">الكل</option>
            {groups.data?.data.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-instructor">المدرس</Label>
          <Select
            id="report-instructor"
            value={instructorId ?? ''}
            onChange={(event) => setParam('instructorId', event.target.value)}
          >
            <option value="">الكل</option>
            {instructorId && !instructorIsListed && (
              <option value={instructorId}>مدرس غير نشط</option>
            )}
            {instructors.data?.data.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-status">الحالة</Label>
          <Select
            id="report-status"
            value={status ?? ''}
            onChange={(event) => setParam('status', event.target.value)}
          >
            <option value="">الكل</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </div>

      {disabled ? null : sessions.isPending ? (
        <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
      ) : sessions.isError ? (
        <Alert variant="danger">{sessions.error.message}</Alert>
      ) : sessions.data.data.length === 0 ? (
        <EmptyState
          icon={<CalendarOffIcon aria-hidden="true" />}
          title="مفيش حصص في الفترة دي"
          description="جرب فترة أو فلتر تاني."
          className="py-6"
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatNumber(sessions.data.meta.total)} حصة
          </p>
          <SessionsTable sessions={sessions.data.data} timeZone={timeZone} />
          <Pagination
            page={sessions.data.meta.page}
            pageSize={pageSize}
            total={sessions.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

function SessionsTable({ sessions, timeZone }: { sessions: Session[]; timeZone: string }) {
  const { can } = usePermissions();
  const canOpen = can('sessions.read');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>التاريخ</TableHead>
          <TableHead>الوقت</TableHead>
          <TableHead>المجموعة</TableHead>
          <TableHead>المدرس</TableHead>
          <TableHead>الحالة</TableHead>
          <TableHead>الموضوع</TableHead>
          <TableHead>المدة الفعلية</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.id}>
            <TableCell className="numeric whitespace-nowrap">
              {canOpen ? (
                <Link to={`/sessions/${session.id}`} className="text-primary hover:underline">
                  {formatDate(session.scheduledAt, timeZone)}
                </Link>
              ) : (
                formatDate(session.scheduledAt, timeZone)
              )}
            </TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {formatTime(session.scheduledAt, timeZone)}
            </TableCell>
            <TableCell className="font-medium whitespace-nowrap">{session.group.name}</TableCell>
            <TableCell className="whitespace-nowrap">{session.instructorName}</TableCell>
            <TableCell>
              <SessionStatusBadge status={session.status} isMakeup={session.isMakeup} />
            </TableCell>
            <TableCell>{session.topic ?? '—'}</TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {session.actualDurationMin === null ? '—' : formatDuration(session.actualDurationMin)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
