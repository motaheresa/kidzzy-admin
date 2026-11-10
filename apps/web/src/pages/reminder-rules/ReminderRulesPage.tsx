import { PageHeader } from '@/components/ui';
import { ReminderRulesScreen } from '@/features/reminder-rules';

/** /reminder-rules: when the academy wants its reminders, for the admin. Composition only. */
export function ReminderRulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="قواعد التذكير"
        description="حدد امتى التذكيرات تتبعت: قبل الحصص، وقبل ما دورات الدفع تخلص."
      />
      <ReminderRulesScreen />
    </div>
  );
}
