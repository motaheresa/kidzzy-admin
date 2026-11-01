import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  deletePushSubscription,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  savePushSubscription,
  unreadCount,
} from '../api/notifications.api';
import { notificationKeys } from '../api/notifications.keys';

const MINUTE = 60_000;

/** The badge count. Refetched every minute and whenever the tab is focused again. */
export function useUnreadCount(enabled: boolean) {
  return useApiQuery({
    queryKey: notificationKeys.unread(),
    queryFn: ({ signal }) => unreadCount(signal),
    enabled,
    refetchInterval: MINUTE,
    refetchOnWindowFocus: true,
    meta: { errorHandling: 'local' },
  });
}

export function useNotifications(page: number) {
  return useApiQuery({
    queryKey: notificationKeys.list({ page }),
    queryFn: ({ signal }) => listNotifications({ page }, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}

function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.unread() }),
  ]);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    meta: { errorHandling: 'local' },
    onSuccess: () => refresh(queryClient),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: markAllNotificationsRead,
    meta: { errorHandling: 'local' },
    onSuccess: () => refresh(queryClient),
  });
}

export function useSavePushSubscription() {
  return useApiMutation({
    mutationFn: savePushSubscription,
    meta: { errorHandling: 'local' },
  });
}

export function useDeletePushSubscription() {
  return useApiMutation({
    mutationFn: deletePushSubscription,
    meta: { errorHandling: 'local' },
  });
}
