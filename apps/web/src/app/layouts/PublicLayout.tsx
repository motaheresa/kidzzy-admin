import { Navigate, Outlet } from 'react-router';
import { FullScreenMessage } from '../../components/ui';
import { useSession } from '../../features/auth';
import { HOME_PATH } from '../../lib/routing';

/**
 * Wraps the screens for signed-out users (/login). A user who is already signed in goes home.
 * If the session check itself fails (network), the login form is shown anyway.
 */
export function PublicLayout() {
  const session = useSession();

  if (session.isPending) return <FullScreenMessage busy title="جاري التحميل" />;
  if (session.data) return <Navigate to={HOME_PATH} replace />;
  return <Outlet />;
}
