import { PageHeader } from '@/components/ui';
import { NotificationList } from '@/features/notifications';

/** /notifications: the signed-in user's notification center. Composition only. */
export function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="الإشعارات" description="اللي وصلك، والأحدث فوق." />
      <NotificationList />
    </div>
  );
}
