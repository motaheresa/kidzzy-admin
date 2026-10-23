import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, SelectField, Skeleton } from '@/components/ui';
import { useInstructorGroups } from '@/features/groups';
import { formatMoney, formatNumber } from '@/lib/format';
import { toAmount } from '@/lib/money';
import { usePlans } from '../hooks/usePlans';
import { useSavePlan } from '../hooks/useSavePlan';
import type { Payee, PaymentPlan } from '../types';

/** A group the instructor can have a plan for: one they teach now, or one they have a plan for. */
interface GroupChoice {
  id: string;
  name: string;
  /** False for a group that is no longer theirs: its plan and cycle are kept, so it can change. */
  teachesNow: boolean;
}

/**
 * Setting or changing a payee's plan (US-20, US-21, BR-10): N sessions per cycle for an amount.
 * A new version applies from the next cycle; the cycle in progress keeps its plan. A student has
 * one plan. An instructor is paid per group (ADR-0015), so the form first asks for the group: the
 * groups they teach now, plus any group they still have a plan for. The FIRST plan of a group
 * also asks for the starting point (BR-14) and opens the cycle 1 of that group; a student's first
 * plan is set when they are enrolled, so a student with none is sent there. The API decides what
 * is valid; its answer shows under each field, or in the alert.
 */
export function PlanForm({ payee }: { payee: Payee }) {
  const isInstructor = payee.type === 'instructor';
  const save = useSavePlan(payee);
  const plans = usePlans(payee);
  const taught = useInstructorGroups(payee.id, isInstructor);
  const [groupId, setGroupId] = useState('');
  const [sessionsPerCycle, setSessionsPerCycle] = useState('');
  const [amount, setAmount] = useState('');
  const [openingCount, setOpeningCount] = useState('0');
  const [missingGroup, setMissingGroup] = useState(false);
  const fieldErrors = save.error?.fieldErrors ?? {};

  if (plans.isPending || (isInstructor && taught.isPending)) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (plans.isError || taught.isError) {
    const message = plans.error?.message ?? taught.error?.message;
    return (
      <Alert variant="danger">
        {message}{' '}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            void plans.refetch();
            if (isInstructor) void taught.refetch();
          }}
        >
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const choices = isInstructor ? groupChoices(taught.data?.data ?? [], plans.data) : [];
  const selected = isInstructor ? groupId || (choices.length === 1 ? choices[0]?.id : '') : '';
  const versions = isInstructor
    ? plans.data.filter((plan) => plan.groupId === selected)
    : plans.data;
  const latest = versions.at(-1);
  if (!latest && !isInstructor) {
    return <Alert variant="warning">الطالب ده مالوش خطة، سجله في جروب الاول.</Alert>;
  }
  if (isInstructor && choices.length === 0) {
    return <Alert variant="warning">المدرس ده مش مدرس اي جروب دلوقتي، اديله جروب الاول.</Alert>;
  }
  const isFirstPlan = !latest;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isInstructor && !selected) {
      setMissingGroup(true);
      return;
    }
    // N and the starting point are whole numbers; the amount stays a decimal string (never a JS
    // number). Only a first plan sends a starting point; only an instructor's plan sends a group.
    save.mutate({
      sessionsPerCycle: Number(sessionsPerCycle),
      amount: toAmount(amount),
      ...(isInstructor ? { groupId: selected } : {}),
      ...(isFirstPlan ? { openingCount: Number(openingCount || '0') } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {isInstructor && (
        <SelectField
          label="الجروب"
          hint="المدرس بياخد فلوسه عن كل جروب لوحده، وله خطة ودورات لكل جروب."
          required
          value={selected}
          onChange={(e) => {
            setGroupId(e.target.value);
            setMissingGroup(false);
          }}
          error={missingGroup ? 'اختار الجروب' : fieldErrors.groupId}
        >
          <option value="">اختار الجروب</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.teachesNow ? choice.name : choice.name + ' (مش بيدرّس فيه دلوقتي)'}
            </option>
          ))}
        </SelectField>
      )}
      <p className="text-sm text-muted-foreground">
        <CurrentPlan latest={latest} isInstructor={isInstructor} hasGroup={selected !== ''} />
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
          hint="عدد السيشنات اللي المدرس اداها من دورته الحالية في الجروب ده قبل السيستم. لو بيبدأ من الصفر سيبها 0."
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

/** The groups they teach now, then the ones they only have a plan for, each once. */
function groupChoices(
  taughtNow: { id: string; name: string }[],
  plans: PaymentPlan[],
): GroupChoice[] {
  const byId = new Map<string, GroupChoice>();
  for (const group of taughtNow) byId.set(group.id, { ...group, teachesNow: true });
  for (const plan of plans) {
    if (plan.groupId && !byId.has(plan.groupId)) {
      byId.set(plan.groupId, { id: plan.groupId, name: plan.groupName ?? '', teachesNow: false });
    }
  }
  return [...byId.values()];
}

function CurrentPlan({
  latest,
  isInstructor,
  hasGroup,
}: {
  latest: PaymentPlan | undefined;
  isInstructor: boolean;
  hasGroup: boolean;
}) {
  if (isInstructor && !hasGroup) return <>اختار الجروب الاول عشان تشوف خطته.</>;
  if (!latest) return <>ده اول خطة للمدرس في الجروب ده، وهتفتح الدورة رقم 1 على طول.</>;
  return (
    <>
      الخطة الحالية:{' '}
      <strong className="text-foreground">{formatNumber(latest.sessionsPerCycle)}</strong> سيشن
      بمبلغ <strong className="text-foreground">{formatMoney(latest.amount)}</strong>. الخطة الجديدة
      بتشتغل من الدورة الجاية، والدورة الحالية بتكمل بخطتها.
    </>
  );
}
