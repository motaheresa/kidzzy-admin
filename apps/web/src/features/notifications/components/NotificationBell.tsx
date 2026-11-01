import { BellIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useUnreadCount } from '../hooks/useNotifications';

/** The header bell. The count refetches every minute and when the tab is focused. */
export function NotificationBell() {
  const unread = useUnreadCount(true);
  const count = unread.data?.count ?? 0;
  const label = count > 0 ? `الإشعارات، ${formatNumber(count)} غير مقروء` : 'الإشعارات';

  return (
    <Button asChild variant="ghost">
      <Link to="/notifications" aria-label={label}>
        <BellIcon aria-hidden="true" />
        {count > 0 && <span className="numeric">{formatNumber(count)}</span>}
      </Link>
    </Button>
  );
}
