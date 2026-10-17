import { PageHeader } from '@/components/ui';
import { GroupsList } from '@/features/groups';

/** /groups: the groups list. Composition only. */
export function GroupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الجروبات" description="الجروبات ومواعيدها الاسبوعية" />
      <GroupsList />
    </div>
  );
}
