import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, SelectField, Skeleton } from '@/components/ui';
import { useGroupOptions } from '@/features/groups';
import { formatDate, localToday } from '@/lib/format';
import { useStudentEnrollments } from '../hooks/useStudentEnrollments';
import { useTransferStudent } from '../hooks/useTransferStudent';

/**
 * Moving a student to another group (US-09, BR-11): the new group and the first day in it. The
 * day before it is the last day in the old group. The plan and the cycle in progress stay with
 * the student. The API decides what is valid; its answer shows under each field (SAME_GROUP and
 * GROUP_INACTIVE under the group, ENROLLMENT_DATE_INVALID under the date).
 */
export function TransferStudentForm({ studentId }: { studentId: string }) {
  const transfer = useTransferStudent(studentId);
  const groups = useGroupOptions();
  const history = useStudentEnrollments(studentId);
  const [toGroupId, setToGroupId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => localToday());
  const fieldErrors = transfer.error?.fieldErrors ?? {};

  function submit(event: FormEvent) {
    event.preventDefault();
    transfer.mutate({ toGroupId, effectiveDate });
  }

  if (groups.isPending || history.isPending) return <Skeleton className="h-48 w-full" />;
  if (groups.isError || history.isError) {
    const failed = groups.isError ? groups : history;
    return (
      <Alert variant="danger">
        {failed.error?.message}{' '}
        <Button variant="link" className="h-auto p-0" onClick={() => void failed.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const current = history.data.find((enrollment) => enrollment.endDate === null);
  if (!current) {
    return <Alert variant="warning">الطالب ده مش في جروب دلوقتي، سجله في جروب الاول.</Alert>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        الطالب في <strong className="text-foreground">{current.group.name}</strong> من{' '}
        {formatDate(current.startDate)}.
      </p>
      <SelectField
        label="الجروب الجديد"
        required
        value={toGroupId}
        onChange={(e) => setToGroupId(e.target.value)}
        error={fieldErrors.toGroupId}
      >
        <option value="">اختار الجروب</option>
        {groups.data.data.map((group) => (
          <option key={group.id} value={group.id} disabled={group.id === current.group.id}>
            {group.name} · {group.level} ({group.instructor.name})
          </option>
        ))}
      </SelectField>
      <FormField
        label="اول يوم في الجروب الجديد"
        type="date"
        dir="ltr"
        className="text-start"
        min={current.startDate}
        hint="اليوم اللي قبله هو آخر يوم في الجروب القديم. الدورة والخطة بتكمل زي ما هي."
        required
        value={effectiveDate}
        onChange={(e) => setEffectiveDate(e.target.value)}
        error={fieldErrors.effectiveDate ?? fieldErrors.startDate}
      />

      {transfer.error && <Alert variant="danger">{transfer.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={transfer.isPending}>
        نقل الطالب
      </Button>
    </form>
  );
}
