import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { pushPublicKey } from '../api/notifications.api';
import { useDeletePushSubscription, useSavePushSubscription } from '../hooks/useNotifications';
import {
  forgetSubscriptionId,
  isIosBrowserNotInstalled,
  rememberSubscriptionId,
  storedSubscriptionId,
  urlBase64ToBytes,
} from '../push-client';

type PushState = 'loading' | 'ios' | 'blocked' | 'on' | 'off';

async function browserSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistration) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Turns web push on or off. The permission prompt runs only when the button is pressed.
 * "On" is whatever the browser currently has subscribed, not a value remembered in localStorage.
 */
export function EnableNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const save = useSavePushSubscription();
  const remove = useDeletePushSubscription();
  const error = save.error ?? remove.error;

  useEffect(() => {
    if (isIosBrowserNotInstalled()) {
      setState('ios');
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    let active = true;
    void browserSubscription()
      .then((subscription) => {
        if (active) setState(subscription ? 'on' : 'off');
      })
      .catch(() => {
        if (active) setState('off');
      });
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'blocked' : 'off');
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await pushPublicKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource,
    });
    const saved = await save.mutateAsync(toInput(subscription));
    rememberSubscriptionId(saved.id);
    setState('on');
  }

  async function disable() {
    const current = await browserSubscription();
    let id = storedSubscriptionId();
    if (!id && current) {
      const saved = await save.mutateAsync(toInput(current));
      id = saved.id;
    }
    if (id) await remove.mutateAsync(id);
    forgetSubscriptionId();
    await current?.unsubscribe();
    setState('off');
  }

  if (state === 'loading') return null;
  if (state === 'ios') {
    return (
      <p className="max-w-xs text-sm text-muted-foreground">
        الإشعارات على الآيفون بتشتغل بعد ما تضيف التطبيق لشاشة البداية.
      </p>
    );
  }
  if (state === 'blocked') {
    return <p className="text-sm text-muted-foreground">المتصفح مانع الإشعارات.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="danger">{error.message}</Alert>}
      {state === 'on' ? (
        <Button
          variant="outline"
          loading={remove.isPending || save.isPending}
          onClick={() => void disable()}
        >
          إيقاف الإشعارات
        </Button>
      ) : (
        <Button variant="outline" loading={save.isPending} onClick={() => void enable()}>
          تفعيل الإشعارات
        </Button>
      )}
    </div>
  );
}

function toInput(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('الاشتراك ناقص');
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  };
}
