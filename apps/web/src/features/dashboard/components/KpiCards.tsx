import { Card, CardContent } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import type { DashboardCounts } from '../types';

const KPIS: { key: keyof DashboardCounts; label: string }[] = [
  { key: 'sessionsToday', label: 'حصص النهارده' },
  { key: 'dueCycles', label: 'دفعات مستحقة' },
  { key: 'cancelledThisWeek', label: 'حصص اتلغت الأسبوع ده' },
  { key: 'unmarked', label: 'حصص لسه ما اتسجلتش' },
];

/** The four numbers at the top of the dashboard. "This week" is the last 7 days, today included. */
export function KpiCards({ counts }: { counts: DashboardCounts }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPIS.map((kpi) => (
        <li key={kpi.key}>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              <span className="numeric text-3xl font-bold">{formatNumber(counts[kpi.key])}</span>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
