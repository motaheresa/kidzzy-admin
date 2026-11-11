import { useState } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { REMINDER_RULES_PER_TYPE } from '@kidzzy/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Switch,
} from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useDeleteReminderRule, useToggleReminderRule } from '../hooks/useReminderRules';
import { ruleLabel, type SECTIONS } from '../lib/rule-labels';
import type { ReminderRule } from '../types';
import { RuleDialog } from './RuleDialog';

type Section = (typeof SECTIONS)[number];

/**
 * One kind of reminder (US-30): its rules in plain Arabic, each with an on/off switch, edit and
 * delete, and "add". A section with no active rule says what then happens, since turning the last
 * one off is allowed and silently stops that reminder.
 */
export function ReminderRuleSection({
  section,
  rules,
}: {
  section: Section;
  rules: ReminderRule[];
}) {
  const toggle = useToggleReminderRule();
  const active = rules.filter((rule) => rule.isActive).length;
  const full = rules.length >= REMINDER_RULES_PER_TYPE;

  return (
    <Card data-testid={`section-${section.type}`}>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active === 0 && <Alert variant="warning">{section.warning}</Alert>}
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">مفيش قواعد لسه.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rules.map((rule) => {
              const label = ruleLabel(rule);
              return (
                <li key={rule.id} className="flex flex-wrap items-center gap-2 py-1">
                  <Switch
                    checked={rule.isActive}
                    disabled={toggle.isPending && toggle.variables?.id === rule.id}
                    onCheckedChange={(isActive) => toggle.mutate({ id: rule.id, isActive })}
                    aria-label={`${rule.isActive ? 'وقّف' : 'شغّل'} ${label}`}
                  />
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  {!rule.isActive && <Badge variant="neutral">موقوفة</Badge>}
                  <RuleDialog
                    type={section.type}
                    rule={rule}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`عدّل ${label}`}>
                        <PencilIcon aria-hidden="true" />
                      </Button>
                    }
                  />
                  <DeleteRuleButton
                    rule={rule}
                    label={label}
                    isLastActive={rule.isActive && active === 1}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <RuleDialog
            type={section.type}
            trigger={
              <Button variant="outline" disabled={full}>
                <PlusIcon aria-hidden="true" />
                اضافة قاعدة
              </Button>
            }
          />
          {full && (
            <p className="text-xs text-muted-foreground">
              وصلت للحد الأقصى ({formatNumber(REMINDER_RULES_PER_TYPE)} قواعد). امسح قاعدة عشان
              تضيف.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteRuleButton({
  rule,
  label,
  isLastActive,
}: {
  rule: ReminderRule;
  label: string;
  isLastActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteReminderRule();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
      trigger={
        <Button variant="ghost" size="icon" aria-label={`امسح ${label}`}>
          <Trash2Icon aria-hidden="true" />
        </Button>
      }
      title="مسح القاعدة"
      description={
        isLastActive
          ? `${label}: دي آخر قاعدة شغالة في القسم ده، ولو مسحتها التذكير ده مش هيتبعت. التذكيرات اللي اتبعتت قبل كده مش بتتأثر.`
          : `${label}. التذكيرات اللي اتبعتت قبل كده مش بتتأثر.`
      }
      confirmLabel="امسح"
      tone="danger"
      busy={remove.isPending}
      onConfirm={() => remove.mutate(rule.id, { onSuccess: () => setOpen(false) })}
    >
      {remove.isError && <Alert variant="danger">{remove.error.message}</Alert>}
    </ConfirmDialog>
  );
}
