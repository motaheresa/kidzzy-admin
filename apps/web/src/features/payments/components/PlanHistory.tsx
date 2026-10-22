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
import type { Payee } from '../types';

/**
 * A payee's plan versions (US-20, US-21), the first first, each with the cycle it applies from. A
 * change adds a version from the next cycle; the cycle in progress keeps the plan it started
 * with. Only whoever reads every plan sees it (an instructor's payments.read is their own plan),
 * and whoever holds payments.manage gets the button: "set" for an instructor with no plan yet
 * (a student's first plan is set when they are enrolled), "change" otherwise.
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
              {hasPlan ? 'تغيير الخطة' : 'تحديد الخطة'}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
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
                : 'حدد عدد السيشنات والمبلغ اللي بيتدفع للمدرس في كل دورة.'
            }
            className="py-6"
          />
        ) : (
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
              {plans.data.map((plan, index) => (
                <TableRow key={plan.id}>
                  <TableCell>{formatNumber(index + 1)}</TableCell>
                  <TableCell>{formatNumber(plan.sessionsPerCycle)}</TableCell>
                  <TableCell>{formatMoney(plan.amount)}</TableCell>
                  <TableCell>{formatNumber(plan.effectiveFromCycle)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
