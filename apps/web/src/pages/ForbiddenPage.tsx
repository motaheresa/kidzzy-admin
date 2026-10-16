import { ShieldXIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState } from '@/components/ui';

/** A screen the signed-in user's permissions do not cover (RequirePermission). */
export function ForbiddenPage() {
  return (
    <EmptyState
      icon={<ShieldXIcon aria-hidden="true" />}
      title="مش مسموح لك تفتح الصفحة دي"
      description="لو محتاجها، كلم إدارة الأكاديمية."
      action={
        <Button asChild variant="outline">
          <Link to="/">ارجع للرئيسية</Link>
        </Button>
      }
    />
  );
}
