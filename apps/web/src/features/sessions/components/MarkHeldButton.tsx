import { useState } from 'react';
import {
  AttendanceStatus,
  ErrorCode,
  type AttendanceRecord,
  type PermissionAction,
  type PermissionScope,
  type Session,
} from '@kidzzy/shared';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  FormField,
  Skeleton,
  TextareaField,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { StarRating, useRefreshAttendance, useSessionAttendance } from '@/features/attendance';
import { usePermissions, useSession } from '@/features/auth';
import { useMarkHeld } from '../hooks/useMarkHeld';
import { canWriteSession } from './session-access';

/**
 * Whether this caller may mark this session Held from the screen: the write rule, a Scheduled
 * status, and a start time that has already come on the browser clock. The API decides again.
 */
function canMarkHeld(
  session: Session,
  callerId: string | undefined,
  can: (action: PermissionAction) => boolean,
  scope: PermissionScope | null,
  now: Date = new Date(),
): boolean {
  if (!canWriteSession(session, callerId, can, scope)) return false;
  if (session.status !== 'scheduled') return false;
  return new Date(session.scheduledAt).getTime() <= now.getTime();
}

/** One student's line while the dialog is open. `homeworkRating` undefined = not chosen yet. */
interface Line {
  status: AttendanceStatus | null;
  performanceRating: number | null;
  homeworkRating: number | null | undefined;
  note: string;
  noteOpen: boolean;
}

const EMPTY_LINE: Line = {
  status: null,
  performanceRating: null,
  homeworkRating: undefined,
  note: '',
  noteOpen: false,
};

const MAX_TOPIC = 300;
const MAX_NOTE = 500;

/**
 * Opens the dialog that marks a session Held (US-13, SCRUM-79): what was taught and every
 * student's attendance, sent in ONE request, so the session is never Held without its
 * attendance. The admin is the only one who can undo it (SCRUM-41).
 */
export function MarkHeldButton({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const me = useSession();
  const { can, scopeFor } = usePermissions();
  if (!canMarkHeld(session, me.data?.id, can, scopeFor('sessions.update'))) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" aria-label={`سجّل حصة ${session.group.name} اتعملت`}>
          سجّلها اتعملت
        </Button>
      </AlertDialogTrigger>
      {/* Mounted only while open, so its state starts fresh each time and nothing loads before. */}
      {open && <HeldDialogContent session={session} close={() => setOpen(false)} />}
    </AlertDialog>
  );
}

function HeldDialogContent({ session, close }: { session: Session; close: () => void }) {
  const [topic, setTopic] = useState('');
  const [lines, setLines] = useState<Record<string, Line>>({});
  const roster = useSessionAttendance(session.id);
  const mark = useMarkHeld(session.id);
  const refreshAttendance = useRefreshAttendance();

  const students = roster.data?.records ?? [];
  const lineOf = (studentId: string): Line => lines[studentId] ?? EMPTY_LINE;
  const patch = (studentId: string, change: Partial<Line>) =>
    setLines((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? EMPTY_LINE), ...change },
    }));

  function setStatus(studentId: string, status: AttendanceStatus) {
    // An absent student cannot be rated, so going absent clears the ratings before anything is sent.
    patch(
      studentId,
      status === AttendanceStatus.Absent
        ? { status, performanceRating: null, homeworkRating: undefined }
        : { status },
    );
  }

  function markAllPresent() {
    setLines((current) =>
      Object.fromEntries(
        students.map((student) => [
          student.studentId,
          { ...(current[student.studentId] ?? EMPTY_LINE), status: AttendanceStatus.Present },
        ]),
      ),
    );
  }

  const complete = students.every((student) => {
    const line = lineOf(student.studentId);
    if (line.status === null) return false;
    return line.status === AttendanceStatus.Absent || line.homeworkRating !== undefined;
  });
  const ready = topic.trim() !== '' && roster.isSuccess && complete;

  function onConfirm() {
    const attendance: AttendanceRecord[] = students.flatMap((student) => {
      const line = lineOf(student.studentId);
      if (line.status === null) return [];
      const absent = line.status === AttendanceStatus.Absent;
      return [
        {
          studentId: student.studentId,
          status: line.status,
          performanceRating: absent ? null : line.performanceRating,
          homeworkRating: absent ? null : (line.homeworkRating ?? null),
          note: line.note.trim() === '' ? null : line.note.trim(),
        },
      ];
    });
    mark.mutate(
      { topic: topic.trim(), attendance },
      {
        onSuccess: () => {
          refreshAttendance(session.id);
          close();
        },
        onError: (error) => {
          // The roster changed since the dialog opened: load it again and keep what was typed.
          if (
            error.code === ErrorCode.AttendanceIncomplete ||
            error.code === ErrorCode.StudentNotInSession
          ) {
            void roster.refetch();
          }
        },
      },
    );
  }

  return (
    <AlertDialogContent
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
      // While the request runs the dialog stays: its result must reach it.
      onEscapeKeyDown={(event) => {
        if (mark.isPending) event.preventDefault();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>تسجّل الحصة إنها اتعملت؟</AlertDialogTitle>
        <AlertDialogDescription>
          اكتب شرحت ايه وسجّل حضور كل الطلاب. الأدمن بس هو اللي يقدر يرجع التسجيل ده.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <FormField
        label="شرحت ايه النهارده؟"
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        error={mark.error?.fieldErrors.topic}
        maxLength={MAX_TOPIC}
        required
      />

      {roster.isPending ? (
        <Skeleton className="h-24 w-full" aria-label="جاري التحميل" />
      ) : roster.isError ? (
        <Alert variant="danger">{roster.error.message}</Alert>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground">مفيش طلاب في الحصة دي.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="outline" className="self-start" onClick={markAllPresent}>
            علّم الكل حاضر
          </Button>
          <ul className="grid gap-2">
            {students.map((student) => {
              const line = lineOf(student.studentId);
              return (
                <li
                  key={student.studentId}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3"
                >
                  <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
                    <span className="font-medium">{student.studentName}</span>
                    <ToggleGroup
                      type="single"
                      value={line.status ?? ''}
                      onValueChange={(value) => {
                        // Clicking the selected option again would clear it; there is no "unrecorded".
                        if (value) setStatus(student.studentId, value as AttendanceStatus);
                      }}
                      aria-label={'حضور ' + student.studentName}
                    >
                      <ToggleGroupItem value={AttendanceStatus.Present}>حاضر</ToggleGroupItem>
                      <ToggleGroupItem value={AttendanceStatus.Absent}>غايب</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  {line.status === AttendanceStatus.Present && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">الأداء (اختياري)</span>
                        <StarRating
                          label={'تقييم الأداء ' + student.studentName}
                          value={line.performanceRating}
                          onChange={(value) =>
                            patch(student.studentId, { performanceRating: value })
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">الواجب</span>
                        <StarRating
                          label={'تقييم الواجب ' + student.studentName}
                          value={line.homeworkRating}
                          noneLabel="مفيش واجب"
                          onChange={(value) => patch(student.studentId, { homeworkRating: value })}
                        />
                      </div>
                    </div>
                  )}
                  {line.noteOpen ? (
                    <TextareaField
                      label={'ملاحظة عن ' + student.studentName}
                      value={line.note}
                      onChange={(event) => patch(student.studentId, { note: event.target.value })}
                      maxLength={MAX_NOTE}
                    />
                  ) : (
                    <Button
                      variant="link"
                      className="h-auto min-h-11 self-start px-0 text-sm"
                      onClick={() => patch(student.studentId, { noteOpen: true })}
                    >
                      {'أضف ملاحظة عن ' + student.studentName}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {mark.isError && <Alert variant="danger">{mark.error.message}</Alert>}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={mark.isPending}>رجوع</AlertDialogCancel>
        {/* A plain button, not AlertDialogAction, so the dialog stays open while it runs. */}
        <Button loading={mark.isPending} disabled={!ready || mark.isPending} onClick={onConfirm}>
          ايوه، سجّلها
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
