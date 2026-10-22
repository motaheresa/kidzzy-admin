import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SessionStatus } from '@kidzzy/shared';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { SESSIONS_PAGE_SIZE } from '../api/sessions.api';
import { useSessionListParams } from '../hooks/useSessionListParams';
import { useSessions } from '../hooks/useSessions';
import { MarkHeldButton } from './MarkHeldButton';
import { SessionStatusBadge } from './SessionStatusBadge';

const STATUS_FILTERS = [
  { value: 'all', label: 'الكل', status: undefined },
  { value: SessionStatus.Scheduled, label: 'مجدولة', status: SessionStatus.Scheduled },
  { value: SessionStatus.Held, label: 'اتعملت', status: SessionStatus.Held },
  { value: SessionStatus.Cancelled, label: 'اتلغت', status: SessionStatus.Cancelled },
] as const;

/**
 * A group's sessions (US-12): number, time and status, filtered in the URL.
 * A missing or forbidden group is already explained by the group screen, so this stays quiet.
 */
export function GroupSessions({ groupId }: { groupId: string }) {
  const { can } = usePermissions();
  const allowed = can('sessions.read');
  const { page, status, setPage, setStatus } = useSessionListParams();
  const sessions = useSessions({ page, groupId, status }, allowed);
  if (!allowed) return null;

  const filter = STATUS_FILTERS.find((item) => item.status === status)?.value ?? 'all';

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>الحصص</CardTitle>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            if (!value) return;
            const next = STATUS_FILTERS.find((item) => item.value === value);
            setStatus(next?.status);
          }}
          aria-label="حالة الحصة"
        >
          {STATUS_FILTERS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sessions.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
        ) : sessions.isError ? (
          sessions.error.kind === 'notFound' || sessions.error.kind === 'forbidden' ? null : (
            <Alert variant="danger">{sessions.error.message}</Alert>
          )
        ) : sessions.data.data.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title={status ? 'مفيش حصص بالحالة دي' : 'مفيش حصص بالجروب ده'}
            description={status ? 'جرب فلتر تاني.' : 'الحصص بتتسجل من الجدول الاسبوعي.'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>الموعد</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data.data.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="numeric">
                    {session.sessionNumber === null ? '—' : formatNumber(session.sessionNumber)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/sessions/${session.id}`}
                      className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
                    >
                      {formatDateTime(session.scheduledAt)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <SessionStatusBadge status={session.status} isMakeup={session.isMakeup} />
                      <MarkHeldButton session={session} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {sessions.data && (
          <Pagination
            page={sessions.data.meta.page}
            pageSize={sessions.data.meta.pageSize || SESSIONS_PAGE_SIZE}
            total={sessions.data.meta.total}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
