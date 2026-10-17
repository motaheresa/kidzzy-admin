import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, SearchInput, SelectField } from '@/components/ui';
import { useStudentOptions } from '@/features/students';
import { localToday } from '@/lib/format';
import { toAmount } from '@/lib/money';
import { useEnrollStudent } from '../hooks/useEnrollStudent';

/**
 * Enrolling a student in a group (US-08, US-36): the student (searched by name or code), the
 * start date, the plan (N sessions per cycle for an amount) and the starting point. The API
 * decides what is valid; its answer shows under each field (AppError.fieldErrors, including
 * STUDENT_ALREADY_ENROLLED under the student and STARTING_POINT_OUT_OF_RANGE under the starting
 * point). A student who had cycles keeps their cycle: the starting point is for a first cycle.
 */
export function EnrollStudentForm({ groupId }: { groupId: string }) {
  const enroll = useEnrollStudent(groupId);
  const [search, setSearch] = useState('');
  const students = useStudentOptions(search);
  const [studentId, setStudentId] = useState('');
  const [startDate, setStartDate] = useState(() => localToday());
  const [sessionsPerCycle, setSessionsPerCycle] = useState('');
  const [amount, setAmount] = useState('');
  const [openingCount, setOpeningCount] = useState('0');
  const fieldErrors = enroll.error?.fieldErrors ?? {};
  const options = students.data?.data ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    enroll.mutate({
      studentId,
      startDate,
      // Counts are whole numbers; the amount stays a decimal string (never a JS number).
      plan: { sessionsPerCycle: Number(sessionsPerCycle), amount: toAmount(amount) },
      openingCount: Number(openingCount || '0'),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <SearchInput
          label="دور على الطالب"
          placeholder="الاسم او الكود"
          onSearch={setSearch}
          className="sm:max-w-none"
        />
        <SelectField
          label="الطالب"
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          error={fieldErrors.studentId ?? (students.isError ? students.error.message : undefined)}
          hint={
            search && options.length === 0 && !students.isPending
              ? 'مفيش طالب نشط بالاسم او الكود ده'
              : undefined
          }
        >
          <option value="">اختار الطالب</option>
          {options.map((student) => (
            <option key={student.id} value={student.id} disabled={student.currentGroup !== null}>
              {student.name} · {student.code}
              {student.currentGroup ? ` (في ${student.currentGroup.name})` : ''}
            </option>
          ))}
        </SelectField>
      </div>

      <FormField
        label="تاريخ البداية"
        type="date"
        dir="ltr"
        className="text-start"
        hint="اول يوم للطالب في الجروب"
        required
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        error={fieldErrors.startDate}
      />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-foreground">خطة الدفع</legend>
        <FormField
          label="عدد سيشنات الدورة"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          dir="ltr"
          className="text-start"
          hint="مثلا 4 او 8"
          required
          value={sessionsPerCycle}
          onChange={(e) => setSessionsPerCycle(e.target.value)}
          error={fieldErrors['plan.sessionsPerCycle'] ?? fieldErrors.plan}
        />
        <FormField
          label="مبلغ الدورة (جنيه)"
          inputMode="decimal"
          dir="ltr"
          className="text-start"
          hint="مثلا 1500"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldErrors['plan.amount']}
        />
      </fieldset>

      <FormField
        label="نقطة البداية"
        type="number"
        inputMode="numeric"
        min={0}
        dir="ltr"
        className="text-start"
        hint="عدد السيشنات اللي الطالب حضرها من دورته الحالية قبل السيستم. لطالب جديد سيبها 0."
        value={openingCount}
        onChange={(e) => setOpeningCount(e.target.value)}
        error={fieldErrors.openingCount}
      />

      {enroll.error && <Alert variant="danger">{enroll.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={enroll.isPending}>
        تسجيل الطالب
      </Button>
    </form>
  );
}
