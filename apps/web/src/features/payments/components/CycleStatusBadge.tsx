import { Badge } from '@/components/ui';
import type { PaymentCycle } from '../types';

const STATUS: Record<
  PaymentCycle['status'],
  { label: string; variant: 'info' | 'warning' | 'success' }
> = {
  in_progress: { label: 'شغالة', variant: 'info' },
  due: { label: 'مستحقة', variant: 'warning' },
  paid: { label: 'اتدفعت', variant: 'success' },
};

/** A cycle's status: in progress, Due or paid. */
export function CycleStatusBadge({ status }: { status: PaymentCycle['status'] }) {
  const item = STATUS[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}
