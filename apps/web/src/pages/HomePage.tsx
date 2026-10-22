import { PageHeader } from '@/components/ui';
import { CurrentUserCard, LogoutButton } from '@/features/auth';
import { TodaySessions } from '@/features/sessions';

/** Home: who is signed in, and today's sessions for whoever may read them (US-12). */
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
    </div>
  );
}
