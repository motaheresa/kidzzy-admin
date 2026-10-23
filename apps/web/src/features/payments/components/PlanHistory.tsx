import { PencilIcon, WalletIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatMoney, formatNumber } from '@/lib/format';
import { usePlans } from '../hooks/usePlans';
import type { Payee, PaymentPlan } from '../types';

/**
 * A payee's plan versions (US-20, US-21), the first first, each with the cycle it applies from. A
 * change adds a version from the next cycle; the cycle in progress keeps the plan it started
 * with. An instructor is paid per group (ADR-0015), so their versions are shown group by group.
 * Only whoever reads every plan sees it (an instructor's payments.read is their own plans), and
 * whoever holds payments.manage gets the button: "set" for an instructor with no plan yet (a
 * student's first plan is set when they are enrolled), "change" otherwise.
 */
export function PlanHistory({ payee }: { payee: Payee }) {
  const { scopeFor } = usePermissions();
  // The query lives in the inner component, so a caller who may not read it never sends it.
  return scopeFor('payments.read') === 'any' ? <PlanVersions payee={payee} /> : null;
}

function PlanVersions({ payee }: { payee: Payee }) {
  const { can } = usePermissions();
  const plans = usePlans(payee);
  const isStudent = payee.type === 'student';
  const hasPlan = (plans.data?.length ?? 0) > 0;
  const canSet = can('payments.manage') && plans.data !== undefined && (hasPlan || !isStudent);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>خطة الدفع</CardTitle>
        {canSet && (
          <Button asChild variant="outline">
            <Link to={`/${isStudent ? 'students' : 'instructors'}/${payee.id}/plan`}>
              <PencilIcon aria-hidden="true" />
              {isStudent ? 'تغيير الخطة' : 'تحديد او تغيير خطة جروب'}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {plans.isPending ? (
          <Skeleton className="h-16 w-full" aria-label="جاري التحميل" />
        ) : plans.isError ? (
          <Alert variant="danger">
            {plans.error.message}{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void plans.refetch()}>
              جرب تاني
            </Button>
          </Alert>
        ) : plans.data.length === 0 ? (
          <EmptyState
            icon={<WalletIcon aria-hidden="true" />}
            title="مفيش خطة دفع لسه"
            description={
              isStudent
                ? 'الخطة بتتحدد لما الطالب يتسجل في جروب.'
                : 'حدد عدد السيشنات والمبلغ اللي بيتدفع للمدرس في كل دورة، لكل جروب.'
            }
            className="py-6"
          />
        ) : isStudent ? (
          <VersionsTable versions={plans.data} />
        ) : (
          groupsOf(plans.data).map(([groupId, versions]) => (
            <section key={groupId} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{versions[0]?.groupName}</h3>
              <VersionsTable versions={versions} />
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** An instructor's versions per group, in the order the API sent them (by group name, then version). */
function groupsOf(plans: PaymentPlan[]): [string, PaymentPlan[]][] {
  const byGroup = new Map<string, PaymentPlan[]>();
  for (const plan of plans) {
    const key = plan.groupId ?? '';
    byGroup.set(key, [...(byGroup.get(key) ?? []), plan]);
  }
  return [...byGroup.entries()];
}

function VersionsTable({ versions }: { versions: PaymentPlan[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>النسخة</TableHead>
          <TableHead>سيشنات الدورة</TableHead>
          <TableHead>المبلغ</TableHead>
          <TableHead>من الدورة</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((plan, index) => (
          <TableRow key={plan.id}>
            <TableCell>{formatNumber(index + 1)}</TableCell>
            <TableCell>{formatNumber(plan.sessionsPerCycle)}</TableCell>
            <TableCell>{formatMoney(plan.amount)}</TableCell>
            <TableCell>{formatNumber(plan.effectiveFromCycle)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
