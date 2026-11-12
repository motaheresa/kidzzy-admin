import { http } from '@/lib/http';
import type { FinanceReport, OverviewReport, SessionsReport } from '../types';

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

/** GET /reports/sessions?from&to: held, cancelled, unmarked and upcoming sessions, per day or month. */
export function getSessionsReport(
  period: { from: string; to: string },
  signal?: AbortSignal,
): Promise<SessionsReport> {
  const query = new URLSearchParams({ from: period.from, to: period.to });
  return http.get<SessionsReport>('/reports/sessions?' + query.toString(), { signal });
}
