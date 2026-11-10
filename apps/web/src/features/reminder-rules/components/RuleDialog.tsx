import { useState, type ReactNode } from 'react';
import { Alert, ConfirmDialog, FormField, SelectField } from '@/components/ui';
import { ReminderRuleType } from '@kidzzy/shared';
import { useCreateReminderRule, useUpdateReminderRule } from '../hooks/useReminderRules';
import { LEAD_UNITS, leadParts, parseValue, valueHint, type LeadUnit } from '../lib/rule-labels';
import type { ReminderRule } from '../types';

/** What the first open of the dialog shows: the rule's own value, or an empty field. */
function startValues(
  type: ReminderRuleType,
  rule?: ReminderRule,
): { text: string; unit: LeadUnit } {
  if (!rule)
    return { text: '', unit: type === ReminderRuleType.SessionReminder ? 'hours' : 'minutes' };
  if (type === ReminderRuleType.SessionReminder) {
    const { amount, unit } = leadParts(rule.leadMinutes ?? 0);
    return { text: String(amount), unit };
  }
  return { text: String(rule.sessionsBeforeEnd ?? ''), unit: 'minutes' };
}

const RANGE_ERROR: Record<'session' | 'payment', string> = {
  session: 'اكتب مدة من 30 دقيقة لحد 7 ايام',
  payment: 'اكتب عدد حصص من 1 لـ 20',
};

/**
 * Add a rule (no `rule`) or change one (US-30): a number, and for a session rule the unit
 * (minutes, hours or days). The range is checked here for a quick answer and by the API for
 * good: its refusals (the same value twice, the limit of 10) show under the field or in the
 * alert, and the dialog stays open.
 */
export function RuleDialog({
  type,
  rule,
  trigger,
}: {
  type: ReminderRuleType;
  rule?: ReminderRule;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => startValues(type, rule).text);
  const [unit, setUnit] = useState<LeadUnit>(() => startValues(type, rule).unit);
  const [checked, setChecked] = useState(false);
  const create = useCreateReminderRule();
  const update = useUpdateReminderRule(rule?.id ?? '');
  const save = rule ? update : create;
  const isSession = type === ReminderRuleType.SessionReminder;

  const value = parseValue(type, text, unit);
  const rangeError =
    checked && value === null ? RANGE_ERROR[isSession ? 'session' : 'payment'] : undefined;
  const fieldError =
    save.error?.fieldErrors?.value ??
    save.error?.fieldErrors?.leadMinutes ??
    save.error?.fieldErrors?.sessionsBeforeEnd;

  function submit() {
    setChecked(true);
    if (value === null) return;
    const onSuccess = () => setOpen(false);
    const field = isSession ? { leadMinutes: value } : { sessionsBeforeEnd: value };
    if (rule) update.mutate(field, { onSuccess });
    else create.mutate({ type, ...field }, { onSuccess });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const start = startValues(type, rule);
          setText(start.text);
          setUnit(start.unit);
          setChecked(false);
        } else {
          save.reset();
        }
      }}
      trigger={trigger}
      title={rule ? 'تعديل القاعدة' : 'اضافة قاعدة'}
      description={
        isSession
          ? 'امتى المدرس يوصله تذكير قبل الحصة؟'
          : 'تنبيه الأدمن لما يفضل كام حصة في الدورة؟'
      }
      confirmLabel="احفظ"
      busy={save.isPending}
      onConfirm={submit}
    >
      <div className="flex flex-col gap-4">
        <div className={isSession ? 'grid grid-cols-[1fr_auto] items-start gap-3' : undefined}>
          <FormField
            label={isSession ? 'قبل الحصة بـ' : 'لما يفضل (عدد الحصص)'}
            hint={valueHint(type, unit)}
            type="number"
            inputMode="numeric"
            min={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            error={rangeError ?? fieldError}
          />
          {isSession && (
            <SelectField
              label="الوحدة"
              value={unit}
              onChange={(event) => setUnit(event.target.value as LeadUnit)}
            >
              {LEAD_UNITS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        {save.isError && !fieldError && <Alert variant="danger">{save.error.message}</Alert>}
      </div>
    </ConfirmDialog>
  );
}
