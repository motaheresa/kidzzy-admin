import { useListParams } from '@/lib/hooks';
import { localToday } from '@/lib/format';
import { useApiQuery } from '@/lib/query';
import { useSession } from '@/features/auth';
import { getFinanceReport, getOverviewReport } from '../api/reports.api';
import { reportKeys } from '../api/reports.keys';
import {
  isBackwards,
  presetPeriod,
  resolvePeriod,
  type Period,
  type PeriodPreset,
} from '../lib/period';

/**
 * The period of the reports, kept in the URL (?from=…&to=…) so it survives a reload and the
 * sidebar links. Without params it is the current month in the academy's zone. A preset other
 * than "this month" writes explicit dates; "this month" clears them, since that is the default.
 */
export function useReportPeriod() {
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const today = localToday(timeZone);
  const { from, to, setRange } = useListParams();
  const period = resolvePeriod(from, to, today);

  return {
    period,
    today,
    backwards: isBackwards(period),
    choose: (preset: Exclude<PeriodPreset, 'custom'>) => {
      if (preset === 'month') setRange(undefined, undefined);
      else {
        const next = presetPeriod(preset, today);
        setRange(next.from, next.to);
      }
    },
    setPeriod: (next: Period) => setRange(next.from, next.to),
  };
}

/** The finance report of a period. The screen shows its own error. `enabled` skips a bad range. */
export function useFinanceReport(period: Period, enabled = true) {
  return useApiQuery({
    queryKey: reportKeys.finance(period),
    queryFn: ({ signal }) => getFinanceReport(period, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** The overview of one full round. The screen shows its own error. */
export function useOverviewReport() {
  return useApiQuery({
    queryKey: reportKeys.overview(),
    queryFn: ({ signal }) => getOverviewReport(signal),
    meta: { errorHandling: 'local' },
  });
}
