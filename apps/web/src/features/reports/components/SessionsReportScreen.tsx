import {
  Alert,
  Button,
  EmptyState,
  Skeleton,
  StackedBarChart,
  type ChartSeries,
} from '@/components/ui';
import { CalendarOffIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { useReportPeriod, useSessionsReport } from '../hooks/useReports';
import { bucketLabel, bucketTitle, hasSessions } from '../lib/buckets';
import { KpiCard, KpiSection } from './KpiCard';
import { SessionsReportTable } from './SessionsReportTable';

const SERIES: ChartSeries[] = [
  { key: 'held', label: 'اتعملت', color: 'var(--color-chart-held)' },
  { key: 'cancelled', label: 'اتلغت', color: 'var(--color-chart-cancelled)' },
  { key: 'unmarked', label: 'مش متسجلة', color: 'var(--color-chart-unmarked)' },
  { key: 'upcoming', label: 'جاية', color: 'var(--color-chart-upcoming)' },
];

/**
 * The sessions report (US-39): six numbers, a stacked bar chart per day (or per month for a long
 * period) and the sessions table. The period comes from the filter at the top and lives in the
 * URL. A range that ends before it starts asks for nothing, as in the finance report.
 */
export function SessionsReportScreen() {
  const { period, backwards } = useReportPeriod();
  const report = useSessionsReport(period, !backwards);

  return (
    <div className="flex flex-col gap-8">
      {backwards ? null : report.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : report.isError ? (
        <Alert variant="danger">
          <p>{report.error.message}</p>
          <Button variant="outline" onClick={() => void report.refetch()}>
            جرب تاني
          </Button>
        </Alert>
      ) : (
        <>
          <KpiSection title="الحصص في الفترة">
            <KpiCard label="اتعملت" value={formatNumber(report.data.kpis.held)} />
            <KpiCard label="اتلغت" value={formatNumber(report.data.kpis.cancelled)} />
            <KpiCard
              label="مش متسجلة"
              value={formatNumber(report.data.kpis.unmarked)}
              hint="حصص عدّى وقتها ومحدش سجلها"
            />
            <KpiCard label="جاية" value={formatNumber(report.data.kpis.upcoming)} />
            <KpiCard
              label="نسبة الحضور"
              value={
                report.data.kpis.attendanceRate === null
                  ? '—'
                  : `${formatNumber(report.data.kpis.attendanceRate)}%`
              }
              hint={
                report.data.kpis.attendanceRate === null ? 'مفيش حضور مسجل في الفترة' : undefined
              }
            />
            <KpiCard
              label="متوسط المدة الفعلية"
              value={
                report.data.kpis.averageActualDurationMin === null
                  ? '—'
                  : `${formatNumber(report.data.kpis.averageActualDurationMin)} دقيقة`
              }
              hint={
                report.data.kpis.averageActualDurationMin === null
                  ? 'مفيش حصة اتعملت ليها بداية ونهاية فعلية'
                  : undefined
              }
            />
          </KpiSection>

          <section className="flex flex-col gap-3" aria-label="الحصص حسب الفترة">
            <h2 className="text-lg font-semibold">
              {report.data.granularity === 'day' ? 'الحصص يوم بيوم' : 'الحصص شهر بشهر'}
            </h2>
            {hasSessions(report.data.buckets) ? (
              <StackedBarChart
                data={report.data.buckets}
                xKey="key"
                series={SERIES}
                tickFormatter={(key) => bucketLabel(key, report.data.granularity)}
                tooltipTitle={(key) => bucketTitle(key, report.data.granularity)}
                ariaLabel="رسم بياني بعدد الحصص في كل فترة حسب حالتها"
                minBarWidth={report.data.granularity === 'day' ? 28 : 64}
              />
            ) : (
              <EmptyState
                icon={<CalendarOffIcon aria-hidden="true" />}
                title="مفيش حصص في الفترة دي"
                className="py-6"
              />
            )}
          </section>
        </>
      )}
      <SessionsReportTable period={period} disabled={backwards} />
    </div>
  );
}
