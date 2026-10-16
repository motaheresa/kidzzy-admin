import { Link } from 'react-router';
import { FullScreenMessage } from '@/components/ui';

/** Any path no route matches. */
export function NotFoundPage() {
  return (
    <FullScreenMessage title="الصفحة دي مش موجودة">
      <Link to="/" className="text-sm underline">
        ارجع للرئيسية
      </Link>
    </FullScreenMessage>
  );
}
