import { PageHeader } from '@/components/ui';
import { AnnouncementsScreen } from '@/features/announcements';

/** /announcements: the admin sends announcements and sees the sent ones. Composition only. */
export function AnnouncementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الاعلانات" description="ابعت اعلان للكل، لدور، او لاشخاص بتختارهم." />
      <AnnouncementsScreen />
    </div>
  );
}
