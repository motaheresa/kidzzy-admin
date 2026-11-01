import type { AppNotification, Page, PushPublicKey, PushSubscription } from '@kidzzy/shared';
import { http } from '@/lib/http';

export const NOTIFICATIONS_PAGE_SIZE = 20;

export function listNotifications(
  params: { page: number; unread?: boolean },
  signal?: AbortSignal,
): Promise<Page<AppNotification>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(NOTIFICATIONS_PAGE_SIZE),
  });
  if (params.unread) query.set('unread', 'true');
  return http.get<Page<AppNotification>>(`/notifications?${query.toString()}`, { signal });
}

export function unreadCount(signal?: AbortSignal): Promise<{ count: number }> {
  return http.get<{ count: number }>('/notifications/unread-count', { signal });
}

export function markNotificationRead(id: string): Promise<void> {
  return http.post<void>(`/notifications/${encodeURIComponent(id)}/read`);
}

export function markAllNotificationsRead(): Promise<void> {
  return http.post<void>('/notifications/read-all');
}

export function pushPublicKey(signal?: AbortSignal): Promise<PushPublicKey> {
  return http.get<PushPublicKey>('/push/public-key', { signal });
}

export function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<PushSubscription> {
  return http.post<PushSubscription>('/push-subscriptions', input);
}

export function deletePushSubscription(id: string): Promise<void> {
  return http.delete<void>(`/push-subscriptions/${encodeURIComponent(id)}`);
}
