import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { useGroupAttendance } from '../hooks/useAttendance';
import { useAttendanceRange } from '../hooks/useAttendanceRange';
import type { GroupAttendance } from '../types';
import { AttendanceMark } from './AttendanceMark';

/**
 * A group's attendance grid (US-19): students down, Held sessions across, present or absent with
 * the two ratings. The date range is kept in the URL. A missing or forbidden group is already
 * explained by the group screen, so this stays quiet then.
 */
export function GroupAttendanceGrid({ groupId }: { groupId: string }) {
  const { can } = usePermissions();
  const me = useSession();
  const allowed = can('attendance.read');
  const { from, to, setFrom, setTo, clear } = useAttendanceRange();
  const rangeIsBackwards = Boolean(from && to && from > to);
  const grid = useGroupAttendance(groupId, { from, to }, allowed && !rangeIsBackwards);
  if (!allowed) return null;

  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const canOpenSessions = can('sessions.read');

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <CardTitle>جدول الحضور</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            type="date"
            label="من"
            value={from ?? ''}
            onChange={(event) => setFrom(event.target.value)}
            error={rangeIsBackwards ? 'تاريخ البداية بعد تاريخ النهاية' : undefined}
          />
          <FormField
            type="date"
            label="إلى"
            value={to ?? ''}
            onChange={(event) => setTo(event.target.value)}
          />
          {(from || to) && (
            <Button variant="outline" onClick={clear}>
              امسح الفلتر
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rangeIsBackwards ? null : grid.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
        ) : grid.isError ? (
          grid.error.kind === 'notFound' || grid.error.kind === 'forbidden' ? null : (
            <Alert variant="danger">{grid.error.message}</Alert>
          )
        ) : grid.data.sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش حصص اتعملت في الفترة دي"
            description={
              from || to ? 'جرب فترة تانية.' : 'الحضور بيظهر بعد ما الحصة تتسجل إنها اتعملت.'
            }
          />
        ) : (
          <GridTable data={grid.data} timeZone={timeZone} canOpenSessions={canOpenSessions} />
        )}
      </CardContent>
    </Card>
  );
}

function GridTable({
  data,
  timeZone,
  canOpenSessions,
}: {
  data: GroupAttendance;
  timeZone: string;
  canOpenSessions: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الطالب</TableHead>
          {data.sessions.map((session) => {
            const label = (
              <>
                <span>{formatDate(session.scheduledAt, timeZone)}</span>
                {session.sessionNumber !== null && (
                  <span className="numeric text-xs text-muted-foreground">
                    {' '}
                    #{formatNumber(session.sessionNumber)}
                  </span>
                )}
              </>
            );
            return (
              <TableHead key={session.id} className="whitespace-nowrap">
                {canOpenSessions ? (
                  <Link to={'/sessions/' + session.id} className="text-primary hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.students.map(({ student, records }) => {
          const bySession = new Map(records.map((record) => [record.sessionId, record]));
          return (
            <TableRow key={student.id}>
              <TableCell className="font-medium whitespace-nowrap">
                {student.name}
                <span className="numeric block text-xs font-normal text-muted-foreground">
                  {student.code}
                </span>
              </TableCell>
              {data.sessions.map((session) => {
                const record = bySession.get(session.id);
                return (
                  <TableCell key={session.id}>
                    {record ? (
                      <AttendanceMark
                        status={record.status}
                        performanceRating={record.performanceRating}
                        homeworkRating={record.homeworkRating}
                      />
                    ) : (
                      <span className="text-muted-foreground" aria-label="ما اتسجلش">
                        —
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
