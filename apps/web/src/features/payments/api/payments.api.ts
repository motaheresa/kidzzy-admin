import { http } from '@/lib/http';
import type { PaymentPlan, PlanInput } from '../types';

// The payment plan endpoints (openapi.yaml, tag Payments), as plain functions over the http
// client. Components never call them; the hooks in ../hooks do.

/** GET /payment-plans?studentId=: the versions of a student's plan, the first first. */
export async function listStudentPlans(
  studentId: string,
  signal?: AbortSignal,
): Promise<PaymentPlan[]> {
  const query = new URLSearchParams({ studentId });
  return (await http.get<{ data: PaymentPlan[] }>(`/payment-plans?${query.toString()}`, { signal }))
    .data;
}

/** POST /students/{id}/payment-plans: the next version, from the cycle after the one in progress. */
export function changeStudentPlan(studentId: string, input: PlanInput): Promise<PaymentPlan> {
  return http.post<PaymentPlan>(`/students/${encodeURIComponent(studentId)}/payment-plans`, input);
}
