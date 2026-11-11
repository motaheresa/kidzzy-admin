import { usePermissions } from '@/features/auth';
import { TodaySessions } from '@/features/sessions';
import { AdminDashboard } from './AdminDashboard';

/**
 * The sessions part of the home page. Whoever holds dashboard.read (the admin) gets the dashboard,
 * which already lists today's sessions, so the plain list is not shown beside it; everyone else
 * keeps the list for whoever may read sessions (US-12, SCRUM-73). The API still enforces both.
 */
export function HomeSessions() {
  const { can } = usePermissions();
  return can('dashboard.read') ? <AdminDashboard /> : <TodaySessions />;
}
