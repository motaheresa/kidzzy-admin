import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  EmptyState,
  PageSizeSelect,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Label,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { paymentMethodLabel, usePayments } from '@/features/payments';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import type { Payment } from '@kidzzy/shared';
import type { Period } from '../lib/period';

/** Report tables show this many rows unless the admin picks 25 or 100. */
export const REPORT_PAGE_SIZE = 50;

const PAYEE_TYPES = ['student', 'instructor'] as const;
const METHODS = ['cash', 'transfer', 'wallet'] as const;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((candidate) => candidate === value);
}

const PAYEE_LABEL: Record<(typeof PAYEE_TYPES)[number], string> = {
  student: 'طالب',
  instructor: 'مدرس',
};

/**
 * The payments of the period (US-38), with payee type and method filters, a row link to the
 * payee, and 50 rows per page unless the admin picks 25 or 100. Page, page size and filters are
 * in the URL, next to the period.
 */
export function FinancePayments({ period, disabled }: { period: Period; disabled: boolean }) {
  const { page, pageSize, setPage, setPageSize, param, setParam } = useListParams({
    pageSize: REPORT_PAGE_SIZE,
  });
  const payeeType = oneOf(PAYEE_TYPES, param('payeeType'));
  const method = oneOf(METHODS, param('method'));
  const payments = usePayments(
    { from: period.from, to: period.to, payeeType, method, page, pageSize },
    !disabled,
  );

  return (
    <section className="flex flex-col gap-3" aria-label="مدفوعات الفترة">
      <h2 className="text-lg font-semibold">مدفوعات الفترة</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-payee-type">المدفوع له</Label>
          <Select
            id="report-payee-type"
            value={payeeType ?? ''}
            onChange={(event) => setParam('payeeType', event.target.value)}
          >
            <option value="">الكل</option>
            {PAYEE_TYPES.map((type) => (
              <option key={type} value={type}>
                {PAYEE_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-method">طريقة الدفع</Label>
          <Select
            id="report-method"
            value={method ?? ''}
            onChange={(event) => setParam('method', event.target.value)}
          >
            <option value="">الكل</option>
            {METHODS.map((value) => (
              <option key={value} value={value}>
                {paymentMethodLabel(value)}
              </option>
            ))}
          </Select>
        </div>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </div>

      {disabled ? null : payments.isPending ? (
        <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
      ) : payments.isError ? (
        <Alert variant="danger">{payments.error.message}</Alert>
      ) : payments.data.data.length === 0 ? (
        <EmptyState
          icon={<CalendarOffIcon aria-hidden="true" />}
          title="مفيش مدفوعات في الفترة دي"
          description="جرب فترة أو فلتر تاني."
          className="py-6"
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatNumber(payments.data.meta.total)} دفعة
          </p>
          <PaymentsTable payments={payments.data.data} />
          <Pagination
            page={payments.data.meta.page}
            pageSize={pageSize}
            total={payments.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

/** The payee's own screen, for whoever may open it. */
function PayeeLink({ payment }: { payment: Payment }) {
  const { can } = usePermissions();
  const student = payment.payeeType === 'student';
  return can(student ? 'students.read' : 'instructors.read') ? (
    <Link
      to={(student ? '/students/' : '/instructors/') + payment.payeeId}
      className="text-primary hover:underline"
    >
      {payment.payeeName}
    </Link>
  ) : (
    <span>{payment.payeeName}</span>
  );
}

function PaymentsTable({ payments }: { payments: Payment[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>التاريخ</TableHead>
          <TableHead>المدفوع له</TableHead>
          <TableHead>النوع</TableHead>
          <TableHead>الدورة</TableHead>
          <TableHead>المبلغ</TableHead>
          <TableHead>الطريقة</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="numeric whitespace-nowrap">
              {formatDate(payment.paidOn)}
            </TableCell>
            <TableCell className="font-medium whitespace-nowrap">
              <PayeeLink payment={payment} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{PAYEE_LABEL[payment.payeeType]}</TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {payment.groupName ? `${payment.groupName} - ` : ''}
              {formatNumber(payment.cycleNumber)}
            </TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {formatMoney(payment.amount)}
            </TableCell>
            <TableCell>{paymentMethodLabel(payment.method)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
