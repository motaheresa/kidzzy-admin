import { PageHeader } from '@/components/ui';
import { CurrentUserCard, LogoutButton } from '@/features/auth';
import { MyCycles } from '@/features/payments';
import { TodaySessions } from '@/features/sessions';

/** Home: who is signed in, today's sessions for whoever may read them (US-12), and an instructor's
 * own payment cycles per group (US-25). */
export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الرئيسية"
        description="اهلا بيك في نظام ادارة الأكاديمية"
        actions={<LogoutButton />}
      />
      <CurrentUserCard />
      <TodaySessions />
      <MyCycles />
    </div>
  );
}
