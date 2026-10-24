import type { Payment } from '../types';

const LABELS: Record<Payment['method'], string> = {
  cash: 'كاش',
  transfer: 'تحويل',
  wallet: 'محفظة',
};

/** The Arabic name of how a payment was made. */
export function paymentMethodLabel(method: Payment['method']): string {
  return LABELS[method];
}
