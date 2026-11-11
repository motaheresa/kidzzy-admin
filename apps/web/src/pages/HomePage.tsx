import { PageHeader } from '@/components/ui';
import { CurrentUserCard, LogoutButton } from '@/features/auth';
import { HomeSessions } from '@/features/dashboard';
import { MyCycles } from '@/features/payments';
import { NeedsMarking } from '@/features/sessions';

/**
 * Home: who is signed in, the sessions that still need marking, today's sessions (the admin's
 * dashboard, US-34, or the plain list, US-12) and an instructor's own payment cycles per group
 * (US-25). The page only composes; each part decides what the caller sees.
 */
export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الرئيسية"
        description="اهلا بيك في نظام ادارة الأكاديمية"
        actions={<LogoutButton />}
      />
      <CurrentUserCard />
      <NeedsMarking />
      <HomeSessions />
      <MyCycles />
    </div>
  );
}
