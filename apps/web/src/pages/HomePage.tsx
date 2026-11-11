import { PageHeader } from '@/components/ui';
import { CurrentUserCard, LogoutButton, usePermissions } from '@/features/auth';
import { AdminDashboard } from '@/features/dashboard';
import { MyCycles } from '@/features/payments';
import { NeedsMarking, TodaySessions } from '@/features/sessions';

/**
 * Home: who is signed in and the sessions that still need marking. Whoever holds dashboard.read
 * (the admin) gets the dashboard, which already lists today's sessions, so the plain list is not
 * shown beside it (US-34). Everyone else keeps today's sessions for whoever may read them
 * (US-12, SCRUM-73) and an instructor's own payment cycles per group (US-25).
 */
export function HomePage() {
  const { can } = usePermissions();
  const isAdminHome = can('dashboard.read');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الرئيسية"
        description="اهلا بيك في نظام ادارة الأكاديمية"
        actions={<LogoutButton />}
      />
      <CurrentUserCard />
      <NeedsMarking />
      {isAdminHome ? <AdminDashboard /> : <TodaySessions />}
      <MyCycles />
    </div>
  );
}
