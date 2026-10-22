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
import { useStudentPlans } from '../hooks/useStudentPlans';

/**
 * A student's plan versions (US-20), the first first, each with the cycle it applies from. A
 * change adds a version from the next cycle; the cycle in progress keeps the plan it started
 * with. Only whoever reads every plan sees it (an instructor's payments.read is their own plan),
 * and whoever holds payments.manage gets the change button.
 */
export function PlanHistory({ studentId }: { studentId: string }) {
  const { scopeFor } = usePermissions();
  // The query lives in the inner component, so a caller who may not read it never sends it.
  return scopeFor('payments.read') === 'any' ? <PlanVersions studentId={studentId} /> : null;
}

function PlanVersions({ studentId }: { studentId: string }) {
  const { can } = usePermissions();
  const plans = useStudentPlans(studentId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>خطة الدفع</CardTitle>
        {can('payments.manage') && plans.data && plans.data.length > 0 && (
          <Button asChild variant="outline">
            <Link to={`/students/${studentId}/plan`}>
              <PencilIcon aria-hidden="true" />
              تغيير الخطة
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
            description="الخطة بتتحدد لما الطالب يتسجل في جروب."
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
