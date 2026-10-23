import { useState, type ReactNode } from 'react';
import { AttendanceStatus, type Session } from '@kidzzy/shared';
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
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatNumber } from '@/lib/format';
import { useSaveAttendance, useSessionAttendance } from '../hooks/useAttendance';
import type { AttendanceDraft, SessionAttendance } from '../types';
import { StarRating } from './StarRating';

type Draft = Record<string, AttendanceDraft>;

function toDraft(data: SessionAttendance): Draft {
  return Object.fromEntries(
    data.records.map((record) => [
      record.studentId,
      {
        status: record.status,
        performanceRating: record.performanceRating,
        homeworkRating: record.homeworkRating,
      },
    ]),
  );
}

/**
 * The attendance of a Held session (US-18): its students with present or absent, and a save
 * button for whoever may record it. Whoever may only read sees the same list without controls.
 * Recording follows the API: scope `own` needs the instructor on the session. The API decides.
 */
export function AttendanceSection({
  session,
}: {
  session: Pick<Session, 'id' | 'status' | 'instructorId'>;
}) {
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  const isHeld = session.status === 'held';
  const canRead = can('attendance.read');
  const attendance = useSessionAttendance(session.id, isHeld && canRead);
  if (!isHeld || !canRead) return null;

  const editable =
    can('attendance.record') &&
    (scopeFor('attendance.record') !== 'own' || session.instructorId === me.data?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>الحضور</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {attendance.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : attendance.isError ? (
          <Alert variant="danger">{attendance.error.message}</Alert>
        ) : attendance.data.records.length === 0 ? (
          <EmptyState
            title="مفيش طلاب في الحصة دي"
            description="الطلاب بيظهروا من تسجيلهم في الجروب في يوم الحصة"
          />
        ) : (
          <AttendanceForm data={attendance.data} editable={editable} />
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceForm({ data, editable }: { data: SessionAttendance; editable: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(data));
  const save = useSaveAttendance(data.sessionId);

  const changed = data.records.filter((record) => {
    const line = draft[record.studentId];
    return (
      line !== undefined &&
      (line.status !== record.status ||
        line.performanceRating !== record.performanceRating ||
        line.homeworkRating !== record.homeworkRating)
    );
  });

  function setStatus(studentId: string, status: AttendanceStatus) {
    setDraft((current) => {
      const line = current[studentId];
      if (!line) return current;
      // An absent student cannot be rated, so going absent clears the ratings.
      return {
        ...current,
        [studentId]:
          status === AttendanceStatus.Absent
            ? { status, performanceRating: null, homeworkRating: null }
            : { ...line, status },
      };
    });
  }

  function setRating(
    studentId: string,
    field: 'performanceRating' | 'homeworkRating',
    value: number | null,
  ) {
    setDraft((current) => {
      const line = current[studentId];
      return line ? { ...current, [studentId]: { ...line, [field]: value } } : current;
    });
  }

  function onSave() {
    save.mutate(
      changed.flatMap((record) => {
        const line = draft[record.studentId];
        if (!line?.status) return [];
        return [
          {
            studentId: record.studentId,
            status: line.status,
            performanceRating: line.performanceRating,
            homeworkRating: line.homeworkRating,
          },
        ];
      }),
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {data.records.map((record) => {
          const line = draft[record.studentId];
          return (
            <li
              key={record.studentId}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3"
            >
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{record.studentName}</span>
                {editable ? (
                  <ToggleGroup
                    type="single"
                    value={line?.status ?? ''}
                    onValueChange={(value) => {
                      // Clicking the selected option again would clear it; there is no "unrecorded".
                      if (value) setStatus(record.studentId, value as AttendanceStatus);
                    }}
                    aria-label={'حضور ' + record.studentName}
                  >
                    <ToggleGroupItem value={AttendanceStatus.Present}>حاضر</ToggleGroupItem>
                    <ToggleGroupItem value={AttendanceStatus.Absent}>غايب</ToggleGroupItem>
                  </ToggleGroup>
                ) : (
                  <StatusBadge status={record.status} />
                )}
              </div>
              {editable && line?.status === AttendanceStatus.Present && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <RatingField label="الأداء">
                    <StarRating
                      label={'تقييم الأداء ' + record.studentName}
                      value={line.performanceRating}
                      onChange={(value) => setRating(record.studentId, 'performanceRating', value)}
                    />
                  </RatingField>
                  <RatingField label="الواجب">
                    <StarRating
                      label={'تقييم الواجب ' + record.studentName}
                      value={line.homeworkRating}
                      noneLabel="مفيش واجب"
                      onChange={(value) => setRating(record.studentId, 'homeworkRating', value)}
                    />
                  </RatingField>
                </div>
              )}
              {!editable && record.status === AttendanceStatus.Present && (
                <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  <span>
                    الأداء:{' '}
                    {record.performanceRating === null
                      ? 'لسه ما اتقيمش'
                      : formatNumber(record.performanceRating) + ' من 5'}
                  </span>
                  <span>
                    الواجب:{' '}
                    {record.homeworkRating === null
                      ? 'مفيش واجب'
                      : formatNumber(record.homeworkRating) + ' من 5'}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <div className="flex flex-col gap-3">
          {save.isError && <Alert variant="danger">{save.error.message}</Alert>}
          {save.isSuccess && changed.length === 0 && <Alert variant="success">اتحفظ</Alert>}
          <Button
            className="self-start"
            onClick={onSave}
            loading={save.isPending}
            disabled={changed.length === 0}
          >
            احفظ الحضور
          </Button>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (status === AttendanceStatus.Present) return <Badge variant="success">حاضر</Badge>;
  if (status === AttendanceStatus.Absent) return <Badge variant="danger">غايب</Badge>;
  return <Badge variant="neutral">لسه ما اتسجلش</Badge>;
}

function RatingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
