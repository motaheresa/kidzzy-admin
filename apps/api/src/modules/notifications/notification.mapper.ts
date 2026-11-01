import type { AppNotification, PushSubscription } from '@kidzzy/shared';
import type { NotificationRow } from './notification.repository';
import type { PushSubscriptionRow } from './push-subscription.repository';

function asData(value: NotificationRow['data']): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value;
}

/** openapi.yaml: Notification. Built field by field. */
export function toNotification(row: NotificationRow): AppNotification {
  const data = asData(row.data);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    ...(data ? { data } : {}),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** openapi.yaml: PushSubscription. The endpoint and its keys stay on the server. */
export function toPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    id: row.id,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}
