import { Button } from '../../../components/ui';
import { useLogout } from '../hooks/useLogout';

/** Signs out of this device; the login page opens whatever the API answers. */
export function LogoutButton() {
  const logout = useLogout();
  return (
    <Button variant="secondary" disabled={logout.isPending} onClick={() => logout.mutate()}>
      تسجيل الخروج
    </Button>
  );
}
