import { Card, CardContent, PageHeader } from '@/components/ui';
import { ChangePasswordForm, LogoutButton } from '@/features/auth';

/**
 * /change-password: any signed-in user, and the only screen while a temporary password must be
 * replaced (US-02), so it also offers logging out. Composition only.
 */
export function ChangePasswordPage() {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <PageHeader title="تغيير كلمة السر" actions={<LogoutButton />} />
      <Card>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
