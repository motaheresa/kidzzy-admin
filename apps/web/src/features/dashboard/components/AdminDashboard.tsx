import { Alert, Button, Skeleton } from '@/components/ui';
import { useSession } from '@/features/auth';
import { useDashboard } from '../hooks/useDashboard';
import { InstructorDueCyclesCard, StudentDueCyclesCard } from './DueCyclesCards';
import { KpiCards } from './KpiCards';
import { RecentHeldCard, TodaySessionsCard } from './DashboardSessions';

/**
 * The admin's home (US-34): four counts, today's sessions, the last Held sessions and the due
 * cycles of students and of instructors. Shown to whoever holds dashboard.read; the API decides.
 */
export function AdminDashboard() {
  const dashboard = useDashboard();
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';

  if (dashboard.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="جاري التحميل">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (dashboard.isError) {
    return (
      <Alert variant="danger">
        <p>{dashboard.error.message}</p>
        <Button variant="outline" onClick={() => void dashboard.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }

  const { counts, todaySessions, recentHeld, dueCycles } = dashboard.data;
  return (
    <div className="flex flex-col gap-6">
      <KpiCards counts={counts} />
      <TodaySessionsCard sessions={todaySessions} timeZone={timeZone} />
      <RecentHeldCard sessions={recentHeld} timeZone={timeZone} />
      <div className="grid gap-6 lg:grid-cols-2">
        <StudentDueCyclesCard cycles={dueCycles.students} timeZone={timeZone} />
        <InstructorDueCyclesCard cycles={dueCycles.instructors} timeZone={timeZone} />
      </div>
    </div>
  );
}
