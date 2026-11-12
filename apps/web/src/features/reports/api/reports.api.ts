import { http } from '@/lib/http';
import type { FinanceReport, OverviewReport } from '../types';

// The report endpoints (openapi.yaml, tag Reports). Components never call them; the hooks do.

/** GET /reports/finance?from&to: money in and out, the expected and the outstanding. */
export function getFinanceReport(
  period: { from: string; to: string },
  signal?: AbortSignal,
): Promise<FinanceReport> {
  const query = new URLSearchParams({ from: period.from, to: period.to });
  return http.get<FinanceReport>('/reports/finance?' + query.toString(), { signal });
}

/** GET /reports/overview: the value of one full round, not filtered by a period. */
export function getOverviewReport(signal?: AbortSignal): Promise<OverviewReport> {
  return http.get<OverviewReport>('/reports/overview', { signal });
}
