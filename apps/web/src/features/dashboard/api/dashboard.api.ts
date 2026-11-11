import { http } from '@/lib/http';
import type { Dashboard } from '../types';

// The dashboard endpoint (openapi.yaml, tag Admin). Components never call it; the hook does.

/** GET /dashboard: the counts, today's sessions, the last Held sessions and the due cycles. */
export function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return http.get<Dashboard>('/dashboard', { signal });
}
