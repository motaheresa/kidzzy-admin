import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button, FormField, SelectField } from '@/components/ui';
import { WEEKDAYS } from '../schedule-format';
import { newSlotDraft, type SlotDraft } from '../slot-draft';

/**
 * The weekly schedule as rows of weekday, start time and duration, with add and remove. It holds
 * no state: the form owns `slots`. `errors` are the API's answers by field name
 * ("schedule", "schedule.0.startTime"), shown under the editor and under each row.
 */
export function ScheduleEditor({
  slots,
  onChange,
  errors = {},
}: {
  slots: SlotDraft[];
  onChange: (slots: SlotDraft[]) => void;
  errors?: Record<string, string>;
}) {
  const update = (key: string, changes: Partial<SlotDraft>) =>
    onChange(slots.map((slot) => (slot.key === key ? { ...slot, ...changes } : slot)));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-foreground">المواعيد الاسبوعية</legend>
      {slots.map((slot, index) => (
        <div
          key={slot.key}
          role="group"
          aria-label={`الميعاد ${index + 1}`}
          className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
        >
          <SelectField
            label="اليوم"
            value={slot.weekday}
            onChange={(e) => update(slot.key, { weekday: e.target.value })}
            error={errors[`schedule.${index}.weekday`]}
          >
            {WEEKDAYS.map((name, weekday) => (
              <option key={name} value={weekday}>
                {name}
              </option>
            ))}
          </SelectField>
          <FormField
            label="الساعة"
            type="time"
            dir="ltr"
            className="text-start"
            value={slot.startTime}
            onChange={(e) => update(slot.key, { startTime: e.target.value })}
            error={errors[`schedule.${index}.startTime`]}
          />
          <FormField
            label="المدة (دقيقة)"
            type="number"
            inputMode="numeric"
            min={15}
            max={240}
            step={15}
            dir="ltr"
            className="text-start"
            value={slot.durationMin}
            onChange={(e) => update(slot.key, { durationMin: e.target.value })}
            error={errors[`schedule.${index}.durationMin`]}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-danger sm:mt-6"
            aria-label={`شيل الميعاد ${index + 1}`}
            disabled={slots.length === 1}
            onClick={() => onChange(slots.filter((s) => s.key !== slot.key))}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      ))}
      {errors.schedule && (
        <p role="alert" className="text-sm text-danger">
          {errors.schedule}
        </p>
      )}
      <Button
        variant="outline"
        className="self-start"
        onClick={() => onChange([...slots, newSlotDraft()])}
      >
        <PlusIcon aria-hidden="true" />
        ضيف ميعاد
      </Button>
    </fieldset>
  );
}
