import { BellIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useUnreadCount } from '../hooks/useNotifications';

/** The header bell, centered on the logo's row. The count refetches every minute and on focus. */
export function NotificationBell() {
  const unread = useUnreadCount(true);
  const count = unread.data?.count ?? 0;
  const label = count > 0 ? `الإشعارات، ${formatNumber(count)} غير مقروء` : 'الإشعارات';

  return (
    <Button asChild variant="ghost" size="icon">
      <Link to="/notifications" aria-label={label} className="relative">
        <BellIcon aria-hidden="true" />
        {count > 0 && (
          <span className="numeric absolute end-1 top-1 text-[10px] leading-none">
            {formatNumber(count)}
          </span>
        )}
      </Link>
    </Button>
  );
}
