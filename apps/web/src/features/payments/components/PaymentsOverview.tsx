import { CalendarOffIcon, WalletIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardContent,
  EmptyState,
  FormField,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useCycles } from '../hooks/useCycles';
import { usePayments } from '../hooks/usePayments';
import {
  usePaymentsParams,
  type OverviewStatus,
  type PaymentsTab,
} from '../hooks/usePaymentsParams';
import type { Payment, PaymentCycle } from '../types';
import { CycleStatusBadge } from './CycleStatusBadge';
import { paymentMethodLabel } from './PaymentMethodLabel';
import { EditStartingPointButton } from './EditStartingPointButton';
import { RecordPaymentButton } from './RecordPaymentButton';

const PAGE_SIZE = 20;

const TABS: { value: PaymentsTab; label: string }[] = [
  { value: 'students', label: 'الطلاب' },
  { value: 'instructors', label: 'المدرسين' },
  { value: 'history', label: 'سجل المدفوعات' },
];

const STATUSES: { value: OverviewStatus; label: string; empty: string }[] = [
  { value: 'due', label: 'مستحقة', empty: 'مفيش دورات مستحقة دلوقتي' },
  { value: 'approaching', label: 'قربت تخلص', empty: 'مفيش دورات فاضل فيها سيشنة او اتنين' },
  { value: 'in_progress', label: 'شغالة', empty: 'مفيش دورات شغالة' },
];

/**
 * The admin's Payments screen (US-24): the students' cycles, the instructors' cycles (one line
 * per group, ADR-0015) and the payment history, in three tabs. The cycles are filtered by Due,
 * approaching (one or two sessions left) and in progress, the Due ones first by default; a Due
 * row has the action to record its payment. The tab, the filter, the page and the dates are in
 * the URL.
 */
export function PaymentsOverview() {
  const { tab, status, page, from, to, setTab, setStatus, setPage, setFrom, setTo, clearRange } =
    usePaymentsParams();

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(value) => {
          if (value) setTab(value as PaymentsTab);
        }}
        aria-label="القسم"
        className="self-start"
      >
        {TABS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {tab === 'history' ? (
        <PaymentHistory
          page={page}
          from={from}
          to={to}
          onPage={setPage}
          onFrom={setFrom}
          onTo={setTo}
          onClear={clearRange}
        />
      ) : (
        <CyclesTab
          payeeType={tab === 'students' ? 'student' : 'instructor'}
          status={status}
          page={page}
          onStatus={setStatus}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function CyclesTab({
  payeeType,
  status,
  page,
  onStatus,
  onPage,
}: {
  payeeType: 'student' | 'instructor';
  status: OverviewStatus;
  page: number;
  onStatus: (status: OverviewStatus) => void;
  onPage: (page: number) => void;
}) {
  const cycles = useCycles({ payeeType, status, page, pageSize: PAGE_SIZE });
  const current = STATUSES.find((item) => item.value === status);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-1">
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(value) => {
            if (value) onStatus(value as OverviewStatus);
          }}
          aria-label="حالة الدورة"
          className="self-start"
        >
          {STATUSES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {cycles.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
        ) : cycles.isError ? (
          <Alert variant="danger">{cycles.error.message}</Alert>
        ) : cycles.data.data.length === 0 ? (
          <EmptyState
            icon={<WalletIcon aria-hidden="true" />}
            title={current?.empty ?? 'مفيش دورات'}
            className="py-6"
          />
        ) : (
          <>
            <CyclesTable cycles={cycles.data.data} instructors={payeeType === 'instructor'} />
            <Pagination
              page={cycles.data.meta.page}
              pageSize={PAGE_SIZE}
              total={cycles.data.meta.total}
              onPageChange={onPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Where a payee's own screen is, for whoever may open it. */
function PayeeName({
  cycle,
}: {
  cycle: Pick<PaymentCycle, 'payeeType' | 'payeeId' | 'payeeName'>;
}) {
  const { can } = usePermissions();
  const student = cycle.payeeType === 'student';
  const allowed = can(student ? 'students.read' : 'instructors.read');
  return allowed ? (
    <Link
      to={(student ? '/students/' : '/instructors/') + cycle.payeeId}
      className="text-primary hover:underline"
    >
      {cycle.payeeName}
    </Link>
  ) : (
    <span>{cycle.payeeName}</span>
  );
}

function CyclesTable({ cycles, instructors }: { cycles: PaymentCycle[]; instructors: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{instructors ? 'المدرس' : 'الطالب'}</TableHead>
          {instructors && <TableHead>الجروب</TableHead>}
          <TableHead>الدورة</TableHead>
          <TableHead>السيشنات</TableHead>
          <TableHead>المبلغ</TableHead>
          <TableHead>الحالة</TableHead>
          <TableHead>
            <span className="sr-only">اجراء</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cycles.map((cycle) => (
          <TableRow key={cycle.id}>
            <TableCell className="font-medium whitespace-nowrap">
              <PayeeName cycle={cycle} />
            </TableCell>
            {instructors && <TableCell className="whitespace-nowrap">{cycle.groupName}</TableCell>}
            <TableCell className="numeric">{formatNumber(cycle.cycleNumber)}</TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {formatNumber(cycle.sessionsCounted)} من {formatNumber(cycle.sessionsPerCycle)}
            </TableCell>
            <TableCell className="numeric whitespace-nowrap">{formatMoney(cycle.amount)}</TableCell>
            <TableCell>
              <CycleStatusBadge status={cycle.status} />
            </TableCell>
            <TableCell>
              <RecordPaymentButton cycle={cycle} />
              <EditStartingPointButton cycle={cycle} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PaymentHistory({
  page,
  from,
  to,
  onPage,
  onFrom,
  onTo,
  onClear,
}: {
  page: number;
  from: string | undefined;
  to: string | undefined;
  onPage: (page: number) => void;
  onFrom: (from: string) => void;
  onTo: (to: string) => void;
  onClear: () => void;
}) {
  const backwards = Boolean(from && to && from > to);
  const history = usePayments({ from, to, page, pageSize: PAGE_SIZE }, !backwards);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-1">
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            type="date"
            label="من"
            value={from ?? ''}
            onChange={(event) => onFrom(event.target.value)}
            error={backwards ? 'تاريخ البداية بعد تاريخ النهاية' : undefined}
          />
          <FormField
            type="date"
            label="إلى"
            value={to ?? ''}
            onChange={(event) => onTo(event.target.value)}
          />
          {(from || to) && (
            <Button variant="outline" onClick={onClear}>
              امسح الفلتر
            </Button>
          )}
        </div>

        {backwards ? null : history.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
        ) : history.isError ? (
          <Alert variant="danger">{history.error.message}</Alert>
        ) : history.data.data.length === 0 ? (
          <EmptyState
            icon={<CalendarOffIcon aria-hidden="true" />}
            title="مفيش مدفوعات"
            description={from || to ? 'جرب فترة تانية.' : 'المدفوعات بتظهر بعد ما تتسجل.'}
            className="py-6"
          />
        ) : (
          <>
            <HistoryTable payments={history.data.data} />
            <Pagination
              page={history.data.meta.page}
              pageSize={PAGE_SIZE}
              total={history.data.meta.total}
              onPageChange={onPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryTable({ payments }: { payments: Payment[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>التاريخ</TableHead>
          <TableHead>المدفوع له</TableHead>
          <TableHead>الجروب</TableHead>
          <TableHead>المبلغ</TableHead>
          <TableHead>الطريقة</TableHead>
          <TableHead>سجّلها</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="numeric whitespace-nowrap">
              {formatDate(payment.paidOn)}
            </TableCell>
            <TableCell className="font-medium whitespace-nowrap">
              <PayeeName cycle={payment} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{payment.groupName ?? '—'}</TableCell>
            <TableCell className="numeric whitespace-nowrap">
              {formatMoney(payment.amount)}
            </TableCell>
            <TableCell>{paymentMethodLabel(payment.method)}</TableCell>
            <TableCell className="whitespace-nowrap">{payment.recordedBy.name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
