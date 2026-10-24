import { http } from '@/lib/http';
import type {
  PaymentListParams,
  Payment,
  PaymentCreate,
  CycleListParams,
  Page,
  Payee,
  PaymentCycle,
  PaymentPlan,
  PlanSaveInput,
} from '../types';

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

/** The most cycles one call returns here (the API's largest page). */
export const CYCLES_PAGE_SIZE = 100;

/**
 * GET /payment-cycles: the cycles of one payee kind, an instructor's one line per group
 * (ADR-0015). Without instructorId the API answers with the caller's own.
 */
export function listCycles(
  params: CycleListParams,
  signal?: AbortSignal,
): Promise<Page<PaymentCycle>> {
  const query = new URLSearchParams({
    payeeType: params.payeeType,
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? CYCLES_PAGE_SIZE),
  });
  if (params.instructorId) query.set('instructorId', params.instructorId);
  if (params.status) query.set('status', params.status);
  return http.get<Page<PaymentCycle>>('/payment-cycles?' + query.toString(), { signal });
}

/**
 * GET /payments: the payment history, newest first. Without instructorId, an instructor gets
 * their own payments. from and to are academy-local dates, both included.
 */
export function listPayments(
  params: PaymentListParams,
  signal?: AbortSignal,
): Promise<Page<Payment>> {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? CYCLES_PAGE_SIZE),
  });
  if (params.instructorId) query.set('instructorId', params.instructorId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return http.get<Page<Payment>>('/payments?' + query.toString(), { signal });
}

/** POST /payment-cycles/{id}/payments: the payment that settles a Due cycle (US-23). */
export function recordPayment(cycleId: string, input: PaymentCreate): Promise<Payment> {
  return http.post<Payment>('/payment-cycles/' + encodeURIComponent(cycleId) + '/payments', input);
}
