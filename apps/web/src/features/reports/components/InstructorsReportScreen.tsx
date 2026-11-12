import { Alert, Button, Skeleton } from '@/components/ui';
import { formatDuration, formatMoney, formatNumber } from '@/lib/format';
import { useInstructorsReport, useReportPeriod } from '../hooks/useReports';
import { KpiCard, KpiSection } from './KpiCard';
import { InstructorsReportTable } from './InstructorsReportTable';

/**
 * The instructors report (US-40): six totals and a table of every instructor, sortable by column.
 * The period comes from the filter at the top and lives in the URL. A range that ends before it
 * starts asks for nothing, as in the other reports.
 */
export function InstructorsReportScreen() {
  const { period, backwards } = useReportPeriod();
  const report = useInstructorsReport(period, !backwards);

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

  const { kpis, rows } = report.data;
  return (
    <div className="flex flex-col gap-8">
      <KpiSection title="المدرسين في الفترة">
        <KpiCard label="مدرسين نشطين" value={formatNumber(kpis.activeInstructors)} />
        <KpiCard label="حصص اتعملت" value={formatNumber(kpis.held)} />
        <KpiCard label="ساعات التدريس الفعلية" value={formatDuration(kpis.actualMinutes)} />
        <KpiCard label="اتدفع للمدرسين" value={formatMoney(kpis.paid)} />
        <KpiCard
          label="مستحق دلوقتي"
          value={formatMoney(kpis.due.total)}
          hint={kpis.due.count > 0 ? `${formatNumber(kpis.due.count)} دورة مستحقة` : undefined}
        />
        <KpiCard label="متوقع صرفه في الفترة" value={formatMoney(kpis.expectedOutflow)} />
      </KpiSection>
      <InstructorsReportTable rows={rows} period={period} />
    </div>
  );
}
