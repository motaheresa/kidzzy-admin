import { PageHeader } from '@/components/ui';
import { InstructorsList } from '@/features/instructors';

/** /instructors: the instructors list. Composition only. */
export function InstructorsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="المدرسين" description="حسابات المدرسين في الأكاديمية" />
      <InstructorsList />
    </div>
  );
}
