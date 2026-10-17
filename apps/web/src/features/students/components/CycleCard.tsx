import { Badge, Card, CardContent, CardHeader, CardTitle, DetailList } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import type { PaymentCycle } from '../types';

const STATUS: Record<
  PaymentCycle['status'],
  { label: string; variant: 'info' | 'warning' | 'success' }
> = {
  in_progress: { label: 'شغالة', variant: 'info' },
  due: { label: 'مستحقة', variant: 'warning' },
  paid: { label: 'اتدفعت', variant: 'success' },
};

/**
 * The student's cycle in progress (FR-15): which cycle, how many of its N sessions are counted,
 * and the amount due when it completes. The starting point shows only when there is one.
 */
export function CycleCard({ cycle }: { cycle: PaymentCycle }) {
  const status = STATUS[cycle.status];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>الدورة الحالية</CardTitle>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent>
        <DetailList
          items={[
            { label: 'رقم الدورة', value: formatNumber(cycle.cycleNumber) },
            {
              label: 'السيشنات',
              value: `${formatNumber(cycle.sessionsCounted)} من ${formatNumber(cycle.sessionsPerCycle)}`,
            },
            { label: 'المبلغ', value: formatMoney(cycle.amount) },
            {
              label: 'نقطة البداية',
              value: cycle.openingCount > 0 ? formatNumber(cycle.openingCount) : null,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
