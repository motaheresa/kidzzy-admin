import { Alert, Button, Skeleton } from '@/components/ui';
import { useReminderRules } from '../hooks/useReminderRules';
import { SECTIONS } from '../lib/rule-labels';
import { ReminderRuleSection } from './ReminderRuleSection';

/**
 * The admin's reminder rules (US-30): three sections, one per kind of reminder. A change affects
 * only reminders not sent yet, which the screen says once at the top.
 */
export function ReminderRulesScreen() {
  const rules = useReminderRules();

  if (rules.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {SECTIONS.map((section) => (
          <Skeleton key={section.type} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (rules.isError) {
    return (
      <Alert variant="danger">
        <p>{rules.error.message}</p>
        <Button variant="outline" onClick={() => void rules.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        التغيير بيأثر على التذكيرات اللي لسه ما اتبعتتش بس. اللي اتبعت قبل كده مش بيتبعت تاني.
      </Alert>
      {SECTIONS.map((section) => (
        <ReminderRuleSection
          key={section.type}
          section={section}
          rules={rules.data.filter((rule) => rule.type === section.type)}
        />
      ))}
    </div>
  );
}
