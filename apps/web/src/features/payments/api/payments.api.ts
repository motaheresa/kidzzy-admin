import { http } from '@/lib/http';
import type { Payee, PaymentPlan, PlanSaveInput } from '../types';

// The payment plan endpoints (openapi.yaml, tag Payments), as plain functions over the http
// client. Components never call them; the hooks in ../hooks do.

/** GET /payment-plans?studentId= or ?instructorId=: the versions of one payee, the first first. */
export async function listPlans(payee: Payee, signal?: AbortSignal): Promise<PaymentPlan[]> {
  const query = new URLSearchParams({
    [payee.type === 'student' ? 'studentId' : 'instructorId']: payee.id,
  });
  return (await http.get<{ data: PaymentPlan[] }>(`/payment-plans?${query.toString()}`, { signal }))
    .data;
}

/**
 * POST /students/{id}/payment-plans or /instructors/{id}/payment-plans: the next version, from the
 * cycle after the one in progress (an instructor's first plan opens their cycle 1 instead).
 */
export function savePlan(payee: Payee, input: PlanSaveInput): Promise<PaymentPlan> {
  const resource = payee.type === 'student' ? 'students' : 'instructors';
  return http.post<PaymentPlan>(
    `/${resource}/${encodeURIComponent(payee.id)}/payment-plans`,
    input,
  );
}
