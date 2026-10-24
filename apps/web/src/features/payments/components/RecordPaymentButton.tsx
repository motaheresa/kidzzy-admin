import { useState } from 'react';
import { PaymentMethod } from '@kidzzy/shared';
import {
  Alert,
  Button,
  ConfirmDialog,
  FormField,
  SelectField,
  TextareaField,
} from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatMoney, formatNumber, localToday } from '@/lib/format';
import { useRecordPayment } from '../hooks/useRecordPayment';
import type { PaymentCycle } from '../types';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.Cash, label: 'كاش' },
  { value: PaymentMethod.Transfer, label: 'تحويل' },
  { value: PaymentMethod.Wallet, label: 'محفظة' },
];

/**
 * "Record payment" on a Due cycle (US-23), for whoever holds payments.manage. One payment settles
 * the whole cycle: the amount is the plan's and cannot be edited, the date is an academy-local
 * day (today by default, never after today), plus the method and an optional note. The API
 * decides; its refusal shows under the field or in the alert. `onRecorded` lets a screen refresh
 * its own data (a student's profile holds the cycle too).
 */
export function RecordPaymentButton({
  cycle,
  onRecorded,
}: {
  cycle: PaymentCycle;
  onRecorded?: () => void;
}) {
  const { can } = usePermissions();
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(() => localToday(timeZone));
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Cash);
  const [note, setNote] = useState('');
  const record = useRecordPayment(cycle.id, onRecorded);
  // An open dialog stays until it is closed, even when the cycle stops being Due underneath it
  // (paid by someone else meanwhile): the person reads why instead of the dialog vanishing.
  if (!can('payments.manage') || (cycle.status !== 'due' && !open)) return null;

  const fieldErrors = record.error?.fieldErrors ?? {};
  const fieldError = Boolean(fieldErrors.amount ?? fieldErrors.paidOn);
  const who = cycle.groupName ? cycle.payeeName + ' - ' + cycle.groupName : cycle.payeeName;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          record.reset();
          setPaidOn(localToday(timeZone));
          setMethod(PaymentMethod.Cash);
          setNote('');
        }
      }}
      trigger={
        <Button variant="outline" aria-label={'سجّل دفعة ' + who}>
          سجّل دفعة
        </Button>
      }
      title="تسجيل دفعة"
      description={who + ' - الدورة ' + formatNumber(cycle.cycleNumber)}
      confirmLabel="سجّل الدفعة"
      busy={record.isPending}
      onConfirm={() =>
        record.mutate(
          {
            amount: cycle.amount,
            paidOn,
            method,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
          { onSuccess: () => setOpen(false) },
        )
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="المبلغ (جنيه)"
          hint="مبلغ خطة الدورة، والدفعة بتسدد الدورة كلها"
          value={formatMoney(cycle.amount)}
          readOnly
          dir="ltr"
          className="text-start"
          error={fieldErrors.amount}
        />
        <FormField
          label="تاريخ الدفع"
          type="date"
          required
          value={paidOn}
          max={localToday(timeZone)}
          onChange={(event) => setPaidOn(event.target.value)}
          error={fieldErrors.paidOn}
        />
        <SelectField
          label="طريقة الدفع"
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
        >
          {METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label="ملاحظة"
          hint="اختياري"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
        {record.isError && !fieldError && <Alert variant="danger">{record.error.message}</Alert>}
      </div>
    </ConfirmDialog>
  );
}
