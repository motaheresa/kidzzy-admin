import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, SelectField, Skeleton } from '@/components/ui';
import { useInstructorOptions } from '@/features/instructors';
import { useCreateGroup } from '../hooks/useGroupMutations';
import { draftsToSlots, newSlotDraft, type SlotDraft } from '../slot-draft';
import { ScheduleEditor } from './ScheduleEditor';

/**
 * The new-group form (US-07): name, level, instructor (active ones), start date and the weekly
 * schedule. The API decides what is valid; its answer is shown under each field
 * (AppError.fieldErrors, including SCHEDULE_OVERLAP under the schedule and
 * INSTRUCTOR_NOT_ASSIGNABLE under the instructor).
 */
export function CreateGroupForm() {
  const create = useCreateGroup();
  const instructors = useInstructorOptions();
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [slots, setSlots] = useState<SlotDraft[]>(() => [newSlotDraft()]);
  const fieldErrors = create.error?.fieldErrors ?? {};

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      name: name.trim(),
      level: level.trim(),
      instructorId,
      startDate,
      schedule: draftsToSlots(slots),
    });
  }

  if (instructors.isPending) return <Skeleton className="h-96 w-full" />;
  if (instructors.isError) {
    return (
      <Alert variant="danger">
        {instructors.error.message}{' '}
        <Button variant="link" className="h-auto p-0" onClick={() => void instructors.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="اسم الجروب"
          autoComplete="off"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <FormField
          label="الكورس / المستوى"
          autoComplete="off"
          hint="مثال: Scratch 1"
          required
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          error={fieldErrors.level}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="المدرس"
          required
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          error={fieldErrors.instructorId}
        >
          <option value="">اختار المدرس</option>
          {instructors.data.data.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </SelectField>
        <FormField
          label="تاريخ البداية"
          type="date"
          dir="ltr"
          className="text-start"
          hint="اول يوم هتتعمل منه السيشنات"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={fieldErrors.startDate}
        />
      </div>

      <ScheduleEditor slots={slots} onChange={setSlots} errors={fieldErrors} />

      {create.error && <Alert variant="danger">{create.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={create.isPending}>
        اضافة الجروب
      </Button>
    </form>
  );
}
