import { useState } from 'react';
import { BellOffIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AppNotification } from '@kidzzy/shared';
import { Alert, Button, EmptyState, Pagination, Skeleton } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { safeReturnTo } from '@/lib/routing';
import { NOTIFICATIONS_PAGE_SIZE } from '../api/notifications.api';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/useNotifications';

/** The signed-in user's notifications, newest first. Opening one marks it read. */
export function NotificationList() {
  const [page, setPage] = useState(1);
  const notifications = useNotifications(page);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();

  async function open(notification: AppNotification) {
    if (!notification.readAt) await markOne.mutateAsync(notification.id);
    const url = notification.data?.url;
    if (typeof url === 'string') {
      const path = safeReturnTo(url);
      if (path !== '/') await navigate(path);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" loading={markAll.isPending} onClick={() => markAll.mutate()}>
          تعليم الكل كمقروء
        </Button>
      </div>
      {(markOne.error || markAll.error) && (
        <Alert variant="danger">{(markOne.error ?? markAll.error)?.message}</Alert>
      )}
      {notifications.isPending ? (
        <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
      ) : notifications.isError ? (
        <Alert variant="danger">{notifications.error.message}</Alert>
      ) : notifications.data.data.length === 0 ? (
        <EmptyState
          icon={<BellOffIcon aria-hidden="true" />}
          title="مفيش إشعارات"
          description="الإشعارات الجديدة هتظهر هنا."
        />
      ) : (
        <ul className="grid gap-2">
          {notifications.data.data.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => void open(notification)}
                className={
                  notification.readAt
                    ? 'flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border border-border bg-background px-4 py-3 text-start'
                    : 'flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border border-primary/40 bg-muted px-4 py-3 text-start'
                }
              >
                <span className="font-medium">{notification.title}</span>
                <span className="text-sm text-muted-foreground">{notification.body}</span>
                <span className="numeric text-xs text-muted-foreground">
                  {formatDateTime(notification.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {notifications.data && (
        <Pagination
          page={notifications.data.meta.page}
          pageSize={notifications.data.meta.pageSize || NOTIFICATIONS_PAGE_SIZE}
          total={notifications.data.meta.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
