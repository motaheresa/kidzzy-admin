import { Alert, Button, Skeleton } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { useFinanceReport, useReportPeriod } from '../hooks/useReports';
import { FinancePayments } from './FinancePayments';
import { KpiCard, KpiSection } from './KpiCard';

/**
 * The finance report (US-38) of the period in the URL: what came in and went out, what the period
 * should bring, what is outstanding, and the payments of the period. A period that ends before it
 * starts is said by the filter and is not asked for.
 */
export function FinanceScreen() {
  const { period, backwards } = useReportPeriod();
  const report = useFinanceReport(period, !backwards);

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
          <KpiSection title="الفعلي">
            <KpiCard label="دخل" value={formatMoney(report.data.actual.in)} />
            <KpiCard label="مصروفات" value={formatMoney(report.data.actual.out)} />
            <KpiCard label="الصافي" value={formatMoney(report.data.actual.net)} />
          </KpiSection>

          <KpiSection
            title="المتوقع"
            note="التوقع بيفترض إن مفيش طالب هيدخل أو يخرج ومفيش حصص تانية هتتلغي."
          >
            <KpiCard label="دخل متوقع" value={formatMoney(report.data.expected.in)} />
            <KpiCard label="مصروفات متوقعة" value={formatMoney(report.data.expected.out)} />
            <KpiCard label="الصافي المتوقع" value={formatMoney(report.data.expected.net)} />
            {(report.data.expected.skippedStudents > 0 ||
              report.data.expected.skippedInstructorPairs > 0) && (
              <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                اتستبعد {formatNumber(report.data.expected.skippedStudents)} طالب و
                {formatNumber(report.data.expected.skippedInstructorPairs)} مدرس وجروب من التوقع
                عشان مفيش ليهم خطة أو تسجيل حالي.
              </p>
            )}
          </KpiSection>

          <KpiSection title="مستحق لسه ما اتدفعش">
            <KpiCard
              label="طلبة"
              value={formatMoney(report.data.outstanding.students.total)}
              hint={`${formatNumber(report.data.outstanding.students.count)} دورة`}
            />
            <KpiCard
              label="مدرسين"
              value={formatMoney(report.data.outstanding.instructors.total)}
              hint={`${formatNumber(report.data.outstanding.instructors.count)} دورة`}
            />
          </KpiSection>
        </>
      )}

      <FinancePayments period={period} disabled={backwards} />
    </div>
  );
}
