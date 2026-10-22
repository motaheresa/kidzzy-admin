import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, Skeleton } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { toAmount } from '@/lib/money';
import { useChangeStudentPlan } from '../hooks/useChangeStudentPlan';
import { useStudentPlans } from '../hooks/useStudentPlans';

/**
 * Changing a student's plan (US-20, BR-10): N sessions per cycle for an amount. The new version
 * applies from the next cycle; the cycle in progress keeps its plan. The API decides what is
 * valid; its answer shows under each field (PLAN_UNCHANGED and STUDENT_HAS_NO_PLAN in the alert).
 */
export function ChangeStudentPlanForm({ studentId }: { studentId: string }) {
  const change = useChangeStudentPlan(studentId);
  const plans = useStudentPlans(studentId);
  const [sessionsPerCycle, setSessionsPerCycle] = useState('');
  const [amount, setAmount] = useState('');
  const fieldErrors = change.error?.fieldErrors ?? {};

  function submit(event: FormEvent) {
    event.preventDefault();
    // N is a whole number; the amount stays a decimal string (never a JS number).
    change.mutate({ sessionsPerCycle: Number(sessionsPerCycle), amount: toAmount(amount) });
  }

  if (plans.isPending) return <Skeleton className="h-48 w-full" />;
  if (plans.isError) {
    return (
      <Alert variant="danger">
        {plans.error.message}{' '}
        <Button variant="link" className="h-auto p-0" onClick={() => void plans.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const latest = plans.data.at(-1);
  if (!latest) {
    return <Alert variant="warning">الطالب ده مالوش خطة، سجله في جروب الاول.</Alert>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        الخطة الحالية:{' '}
        <strong className="text-foreground">{formatNumber(latest.sessionsPerCycle)}</strong> سيشن
        بمبلغ <strong className="text-foreground">{formatMoney(latest.amount)}</strong>. الخطة
        الجديدة بتشتغل من الدورة الجاية، والدورة الحالية بتكمل بخطتها.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
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
          error={fieldErrors.sessionsPerCycle}
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
          error={fieldErrors.amount}
        />
      </div>

      {change.error && <Alert variant="danger">{change.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={change.isPending}>
        حفظ الخطة
      </Button>
    </form>
  );
}
