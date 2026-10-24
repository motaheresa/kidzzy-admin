import { PageHeader } from '@/components/ui';
import { PaymentsOverview } from '@/features/payments';

/** /payments: every cycle and every payment, for the admin. Composition only. */
export function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المدفوعات"
        description="دورات الطلاب والمدرسين، المستحق اولا، وسجل المدفوعات."
      />
      <PaymentsOverview />
    </div>
  );
}
