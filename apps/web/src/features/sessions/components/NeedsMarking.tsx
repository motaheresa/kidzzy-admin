import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Card, CardContent, CardHeader, CardTitle, Pagination } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useCurrentMinute } from '../hooks/useCurrentMinute';
import { useSessions } from '../hooks/useSessions';
import { CancelSessionButton } from './CancelSessionButton';
import { MarkHeldButton } from './MarkHeldButton';

/**
 * The sessions whose time has passed and that are still Scheduled, oldest first (SCRUM-73), above
 * today's list. A session nobody marked would otherwise disappear from the home screen at
 * midnight while still blocking the next one (SESSION_OUT_OF_ORDER) with no visible reason. Each
 * row has the Held and Cancel actions where the caller may write; once it is marked it leaves
 * here and today's list. Whoever sees sessions at all sees only theirs (the API's visibility
 * rule); the admin sees the academy's, with the instructor of each. Nothing shows when there are
 * none.
 */
export function NeedsMarking() {
  const { can } = usePermissions();
  const me = useSession();
  if (!can('sessions.read') || !me.data) return null;
  return <NeedsMarkingList timeZone={me.data.academy.timezone} />;
}

function NeedsMarkingList({ timeZone }: { timeZone: string }) {
  const { scopeFor } = usePermissions();
  const [page, setPage] = useState(1);
  const to = useCurrentMinute();
  // GET /sessions: `to` is exclusive, so these started before this minute.
  const sessions = useSessions({ page, status: 'scheduled', to });
  const total = sessions.data?.meta.total ?? 0;
  const empty = sessions.data !== undefined && sessions.data.data.length === 0;

  // Marking the last session of a later page leaves that page empty: go back to the first.
  useEffect(() => {
    if (empty && total > 0 && page > 1) setPage(1);
  }, [empty, total, page]);

  if (sessions.isError) return <Alert variant="danger">{sessions.error.message}</Alert>;
  if (!sessions.data || total === 0) return null;
  const showInstructor = scopeFor('sessions.read') === 'any';

  return (
    <Card>
      <CardHeader>
        <CardTitle>سيشنات محتاجة تتسجل ({formatNumber(total)})</CardTitle>
        <p className="text-sm text-muted-foreground">
          فات ميعادها ولسه مجدولة. سجّلها اتعملت او الغيها، لان مينفعش تسجل اللي بعدها قبلها.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2">
          {sessions.data.data.map((session) => (
            <li
              key={session.id}
              className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
            >
              <Link
                to={'/sessions/' + session.id}
                className="flex min-h-11 flex-1 flex-col justify-center rounded-md transition-colors duration-fast ease-out hover:bg-muted"
              >
                <span className="font-medium">{session.group.name}</span>
                <span className="numeric text-sm text-muted-foreground">
                  {formatDateTime(session.scheduledAt, timeZone)}
                  {showInstructor && ' - ' + session.instructorName}
                </span>
              </Link>
              <span className="flex flex-wrap items-center gap-2">
                <MarkHeldButton session={session} />
                <CancelSessionButton session={session} />
              </span>
            </li>
          ))}
        </ul>
        <Pagination
          page={sessions.data.meta.page}
          pageSize={sessions.data.meta.pageSize}
          total={sessions.data.meta.total}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}
