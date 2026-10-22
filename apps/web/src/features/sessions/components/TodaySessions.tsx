import { useState } from 'react';
import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
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
import { formatTime, zonedDayRange } from '@/lib/format';
import { useSessions } from '../hooks/useSessions';
import { SessionStatusBadge } from './SessionStatusBadge';

/**
 * Today's sessions of the caller's groups (US-12), in the academy's timezone.
 * Shown only to someone who holds sessions.read; the API still enforces that.
 * Marking held, cancelling and rescheduling arrive with their own stories.
 */
export function TodaySessions() {
  const { can } = usePermissions();
  const session = useSession();
  if (!can('sessions.read')) return null;
  const timeZone = session.data?.academy.timezone;
  if (!timeZone) {
    return <Skeleton className="h-40 w-full" />;
  }
  return <TodaySessionsList timeZone={timeZone} />;
}

function TodaySessionsList({ timeZone }: { timeZone: string }) {
  const [page, setPage] = useState(1);
  const range = zonedDayRange(timeZone);
  const sessions = useSessions({ page, ...range });

  return (
    <Card>
      <CardHeader>
        <CardTitle>سيشنات النهارده</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sessions.isPending ? (
          <div className="grid gap-3" aria-label="جاري التحميل">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : sessions.isError ? (
          <Alert variant="danger">{sessions.error.message}</Alert>
        ) : sessions.data.data.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش حصص النهارده"
            description="حصص جروباتك في اليوم ده هتظهر هنا."
          />
        ) : (
          <ul className="grid gap-2">
            {sessions.data.data.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/sessions/${session.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast ease-out hover:bg-muted"
                >
                  <span className="font-medium">{session.group.name}</span>
                  <span className="numeric text-sm text-muted-foreground">
                    {formatTime(session.scheduledAt, timeZone)}
                  </span>
                  <SessionStatusBadge status={session.status} isMakeup={session.isMakeup} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sessions.data && (
          <Pagination
            page={sessions.data.meta.page}
            pageSize={sessions.data.meta.pageSize}
            total={sessions.data.meta.total}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
