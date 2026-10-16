import { LayoutDashboardIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui';
import { CurrentUserCard, LogoutButton } from '@/features/auth';

/** Home: who is signed in, until the real screens arrive. Composition only. */
export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الرئيسية"
        description="اهلا بيك في نظام ادارة الأكاديمية"
        actions={<LogoutButton />}
      />
      <CurrentUserCard />
      <EmptyState
        icon={<LayoutDashboardIcon aria-hidden="true" />}
        title="الشاشات الجاية في الطريق"
        description="الجروبات والحصص والمدفوعات هتظهر هنا قريب."
      />
    </div>
  );
}
