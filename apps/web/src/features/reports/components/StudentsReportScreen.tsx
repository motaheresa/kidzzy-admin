import { CalendarOffIcon } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { REPEATED_ABSENCE_THRESHOLD } from '@kidzzy/shared';
import {
  Alert,
  Button,
  EmptyState,
  Skeleton,
  StackedBarChart,
  type ChartSeries,
} from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useReportPeriod, useStudentsReport } from '../hooks/useReports';
import { bucketLabel, bucketTitle } from '../lib/buckets';
import { KpiCard, KpiSection } from './KpiCard';
import { StudentsReportTable } from './StudentsReportTable';

const SERIES: ChartSeries[] = [
  { key: 'present', label: 'حضر', color: 'var(--color-chart-present)' },
  { key: 'absent', label: 'غاب', color: 'var(--color-chart-absent)' },
];

/** A rating out of five, or a dash when nobody was rated. */
const rating = (value: number | null) => (value === null ? '—' : `${formatNumber(value)} / 5`);

/**
 * The students report (US-41): nine numbers, a stacked bar chart of present and absent per day (or
 * per month for a long period) and the table of students. The period comes from the filter at the
 * top and lives in the URL. A range that ends before it starts asks for nothing, as in the other
 * reports. The repeated-absence card is a link: it opens the table filtered by that streak.
 */
export function StudentsReportScreen() {
  const { period, backwards } = useReportPeriod();
  const report = useStudentsReport(period, !backwards);
  const [params] = useSearchParams();

  if (backwards) return null;
  if (report.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (report.isError) {
    return (
      <Alert variant="danger">
        <p>{report.error.message}</p>
        <Button variant="outline" onClick={() => void report.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const { kpis, granularity, buckets, rows } = report.data;
  // The same page and period, with the table filtered by repeated absence (and back on page one).
  const repeated = new URLSearchParams(params);
  repeated.set('repeated', '1');
  repeated.delete('page');

  return (
    <div className="flex flex-col gap-8">
      <KpiSection title="الطلاب في الفترة">
        <KpiCard label="طلاب نشطين" value={formatNumber(kpis.activeStudents)} />
        <KpiCard label="انضموا في الفترة" value={formatNumber(kpis.joined)} />
        <KpiCard label="سابوا في الفترة" value={formatNumber(kpis.left)} />
        <KpiCard label="حضور" value={formatNumber(kpis.present)} />
        <KpiCard label="غياب" value={formatNumber(kpis.absent)} />
        <KpiCard
          label="نسبة الحضور"
          value={kpis.attendanceRate === null ? '—' : `${formatNumber(kpis.attendanceRate)}%`}
          hint={kpis.attendanceRate === null ? 'مفيش حضور مسجل في الفترة' : undefined}
        />
        <KpiCard label="متوسط الأداء" value={rating(kpis.averagePerformance)} />
        <KpiCard
          label="متوسط الواجب"
          value={rating(kpis.averageHomework)}
          hint="من غير الحصص اللي مفيهاش واجب"
        />
        <KpiCard
          label="غياب متكرر"
          value={formatNumber(kpis.repeatedAbsence)}
          hint={`${formatNumber(REPEATED_ABSENCE_THRESHOLD)} غيابات ورا بعض أو أكتر`}
          to={{ search: `?${repeated.toString()}` }}
        />
      </KpiSection>

      <section className="flex flex-col gap-3" aria-label="الحضور والغياب حسب الفترة">
        <h2 className="text-lg font-semibold">
          {granularity === 'day' ? 'الحضور والغياب يوم بيوم' : 'الحضور والغياب شهر بشهر'}
        </h2>
        {buckets.some((bucket) => bucket.present + bucket.absent > 0) ? (
          <StackedBarChart
            data={buckets}
            xKey="key"
            series={SERIES}
            tickFormatter={(key) => bucketLabel(key, granularity)}
            tooltipTitle={(key) => bucketTitle(key, granularity)}
            ariaLabel="رسم بياني بعدد الحضور والغياب في كل فترة"
            minBarWidth={granularity === 'day' ? 28 : 64}
          />
        ) : (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش حضور مسجل في الفترة دي"
            className="py-6"
          />
        )}
      </section>

      <StudentsReportTable rows={rows} />
    </div>
  );
}
