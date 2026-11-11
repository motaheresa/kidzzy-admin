import { CalendarOffIcon, CheckCheckIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { SessionStatusBadge } from '@/features/sessions';
import { formatDuration, formatTime } from '@/lib/format';
import type { Dashboard } from '../types';

const ROW =
  'flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast ease-out hover:bg-muted';

/** Today's sessions in time order: group, instructor on the session, time and status. */
export function TodaySessionsCard({
  sessions,
  timeZone,
}: {
  sessions: Dashboard['todaySessions'];
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>سيشنات النهارده</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش حصص النهارده"
            description="حصص الأكاديمية في اليوم ده هتظهر هنا."
          />
        ) : (
          <ul className="grid gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link to={`/sessions/${session.id}`} className={ROW}>
                  <span className="flex flex-col">
                    <span className="font-medium">{session.group.name}</span>
                    <span className="text-sm text-muted-foreground">{session.instructorName}</span>
                  </span>
                  <span className="numeric text-sm text-muted-foreground">
                    {formatTime(session.scheduledAt, timeZone)}
                  </span>
                  <SessionStatusBadge
                    status={session.status}
                    isMakeup={session.isMakeup}
                    compensates={session.compensatesSessionId !== null}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The last Held sessions, newest first: topic, attendance and how long it really ran. */
export function RecentHeldCard({
  sessions,
  timeZone,
}: {
  sessions: Dashboard['recentHeld'];
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>آخر الحصص اللي اتعملت</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CheckCheckIcon aria-hidden="true" />}
            title="لسه مفيش حصص اتعملت"
            description="الحصص بعد ما تتسجل اتعملت هتظهر هنا."
          />
        ) : (
          <ul className="grid gap-2">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <Link to={`/sessions/${session.sessionId}`} className={ROW}>
                  <span className="flex flex-col">
                    <span className="font-medium">{session.group.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {session.instructor.name}
                      {session.topic ? ` - ${session.topic}` : ''}
                    </span>
                  </span>
                  <span className="numeric text-sm text-muted-foreground">
                    {formatTime(session.scheduledAt, timeZone)}
                  </span>
                  <span className="numeric text-sm">
                    حضر {session.attendance.present} من {session.attendance.enrolled}
                  </span>
                  <span className="numeric text-sm text-muted-foreground">
                    {session.actualDurationMin === null
                      ? 'ما اتسجلش وقت'
                      : formatDuration(session.actualDurationMin)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
