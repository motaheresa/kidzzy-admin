import { useState } from 'react';
import { Alert, Button, ConfirmDialog, FormField } from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatNumber } from '@/lib/format';
import { useSetStartingPoint } from '../hooks/useSetStartingPoint';
import type { PaymentCycle } from '../types';

/** Whether the starting point of this cycle can still be corrected (US-36). */
const canEditStartingPoint = (cycle: PaymentCycle) =>
  cycle.cycleNumber === 1 && cycle.status === 'in_progress';

/**
 * "Edit starting point" on a payee's first cycle while it is in progress (US-36, BR-14), for
 * whoever holds payments.manage. The dialog shows the result ("x of N") before saving: the new
 * starting point plus the sessions the cycle already counted. The API decides; its refusal
 * shows under the field or in the alert, and the dialog stays open even if the cycle stops being
 * editable underneath it. `onChanged` lets a screen refresh its own data.
 */
export function EditStartingPointButton({
  cycle,
  onChanged,
}: {
  cycle: PaymentCycle;
  onChanged?: () => void;
}) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(cycle.openingCount));
  const save = useSetStartingPoint(cycle.id, onChanged);
  if (!can('payments.manage') || (!canEditStartingPoint(cycle) && !open)) return null;

  const count = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(count) && count >= 0;
  // The sessions the cycle counted since it started: the counter without the starting point.
  const result = count + (cycle.sessionsCounted - cycle.openingCount);
  const outOfRange = valid && result >= cycle.sessionsPerCycle;
  const fieldError = save.error?.fieldErrors?.openingCount;
  const who = cycle.groupName ? cycle.payeeName + ' - ' + cycle.groupName : cycle.payeeName;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(String(cycle.openingCount));
        else save.reset();
      }}
      trigger={
        <Button variant="outline" aria-label={'عدّل نقطة البداية ' + who}>
          عدّل نقطة البداية
        </Button>
      }
      title="نقطة البداية"
      description={who + ' - الدورة ' + formatNumber(cycle.cycleNumber)}
      confirmLabel="احفظ"
      busy={save.isPending}
      onConfirm={() => {
        if (valid && !outOfRange) save.mutate(count, { onSuccess: () => setOpen(false) });
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="السيشنات اللي اتاخدت قبل السيستم"
          hint={'من صفر لحد ' + formatNumber(cycle.sessionsPerCycle - 1)}
          type="number"
          inputMode="numeric"
          min={0}
          max={cycle.sessionsPerCycle - 1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={fieldError ?? (outOfRange ? 'لازم يفضل اقل من عدد سيشنات الدورة' : undefined)}
        />
        {valid && (
          <p className="numeric text-sm text-muted-foreground">
            هتبقى الدورة {formatNumber(result)} من {formatNumber(cycle.sessionsPerCycle)} سيشن
          </p>
        )}
        {save.isError && !fieldError && <Alert variant="danger">{save.error.message}</Alert>}
      </div>
    </ConfirmDialog>
  );
}
