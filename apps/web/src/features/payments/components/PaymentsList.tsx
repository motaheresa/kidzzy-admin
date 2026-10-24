import { formatDate, formatMoney } from '@/lib/format';
import { usePayments } from '../hooks/usePayments';
import { paymentMethodLabel } from './PaymentMethodLabel';

/**
 * An instructor's payments next to their cycles (US-25), newest first, with the group each one
 * was for (an instructor is paid per group, ADR-0015). Without instructorId the API answers with
 * the signed-in instructor's own. It shows nothing until there is a payment, and stays quiet when
 * the payments are refused: the cycles above it already tell the story.
 */
export function PaymentsList({ instructorId }: { instructorId?: string }) {
  const payments = usePayments({ instructorId, pageSize: 20 });
  if (!payments.data || payments.data.data.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">المدفوعات السابقة</h3>
      <ul className="grid gap-2">
        {payments.data.data.map((payment) => (
          <li
            key={payment.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm"
          >
            <span className="flex flex-col">
              <span className="font-medium">{payment.groupName}</span>
              <span className="numeric text-xs text-muted-foreground">
                {formatDate(payment.paidOn)} - {paymentMethodLabel(payment.method)}
              </span>
            </span>
            <span className="numeric">{formatMoney(payment.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
