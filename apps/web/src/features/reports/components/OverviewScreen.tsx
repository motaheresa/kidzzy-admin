import { Alert, Button, Skeleton } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { useOverviewReport } from '../hooks/useReports';
import { KpiCard, KpiSection } from './KpiCard';

/**
 * The reports overview (US-38): the value of one full cycle round. It is not filtered by the
 * period: one cycle at the latest plan for every student with an open enrollment (income) and for
 * every instructor and group pair of an active group (outflow), and how long a round lasts.
 */
export function OverviewScreen() {
  const overview = useOverviewReport();

  if (overview.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <Alert variant="danger">
        <p>{overview.error.message}</p>
        <Button variant="outline" onClick={() => void overview.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const { roundIncome, roundOutflow, roundNet, averageRoundWeeks } = overview.data;
  return (
    <KpiSection
      title="دورة كاملة"
      note="مش مرتبطة بالفترة اللي فوق: بتحسب دورة واحدة بسعر الخطة الحالية لكل طالب ومدرس."
    >
      <KpiCard label="دخل الدورة" value={formatMoney(roundIncome)} />
      <KpiCard label="مصروفات الدورة" value={formatMoney(roundOutflow)} />
      <KpiCard label="صافي الدورة" value={formatMoney(roundNet)} />
      <KpiCard
        label="متوسط طول الدورة"
        value={averageRoundWeeks === null ? '—' : `${formatNumber(averageRoundWeeks)} أسبوع`}
        hint={averageRoundWeeks === null ? 'مفيش طلاب بخطة وجدول' : undefined}
      />
    </KpiSection>
  );
}
