import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, Skeleton } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { toAmount } from '@/lib/money';
import { usePlans } from '../hooks/usePlans';
import { useSavePlan } from '../hooks/useSavePlan';
import type { Payee } from '../types';

/**
 * Setting or changing a payee's plan (US-20, US-21, BR-10): N sessions per cycle for an amount.
 * A new version applies from the next cycle; the cycle in progress keeps its plan. An
 * instructor's FIRST plan also asks for the starting point (BR-14) and opens their cycle 1; a
 * student's first plan is set when they are enrolled, so a student with none is sent there. The
 * API decides what is valid; its answer shows under each field, or in the alert.
 */
export function PlanForm({ payee }: { payee: Payee }) {
  const save = useSavePlan(payee);
  const plans = usePlans(payee);
  const [sessionsPerCycle, setSessionsPerCycle] = useState('');
  const [amount, setAmount] = useState('');
  const [openingCount, setOpeningCount] = useState('0');
  const fieldErrors = save.error?.fieldErrors ?? {};

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
  if (!latest && payee.type === 'student') {
    return <Alert variant="warning">الطالب ده مالوش خطة، سجله في جروب الاول.</Alert>;
  }
  const isFirstPlan = !latest;

  function submit(event: FormEvent) {
    event.preventDefault();
    // N and the starting point are whole numbers; the amount stays a decimal string (never a JS
    // number). Only a first plan sends a starting point.
    save.mutate({
      sessionsPerCycle: Number(sessionsPerCycle),
      amount: toAmount(amount),
      ...(isFirstPlan ? { openingCount: Number(openingCount || '0') } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        {latest ? (
          <>
            الخطة الحالية:{' '}
            <strong className="text-foreground">{formatNumber(latest.sessionsPerCycle)}</strong>{' '}
            سيشن بمبلغ <strong className="text-foreground">{formatMoney(latest.amount)}</strong>.
            الخطة الجديدة بتشتغل من الدورة الجاية، والدورة الحالية بتكمل بخطتها.
          </>
        ) : (
          'ده اول خطة للمدرس، وهتفتح الدورة رقم 1 على طول.'
        )}
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
      {isFirstPlan && (
        <FormField
          label="نقطة البداية"
          type="number"
          inputMode="numeric"
          min={0}
          dir="ltr"
          className="text-start"
          hint="عدد السيشنات اللي المدرس اداها من دورته الحالية قبل السيستم. لو بيبدأ من الصفر سيبها 0."
          value={openingCount}
          onChange={(e) => setOpeningCount(e.target.value)}
          error={fieldErrors.openingCount}
        />
      )}

      {save.error && <Alert variant="danger">{save.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={save.isPending}>
        حفظ الخطة
      </Button>
    </form>
  );
}
