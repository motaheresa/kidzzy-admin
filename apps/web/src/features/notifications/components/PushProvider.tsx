import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pushPublicKey } from '../api/notifications.api';
import { useDeletePushSubscription, useSavePushSubscription } from '../hooks/useNotifications';
import { PushContext, type PushControl, type PushState } from '../push-context';
import {
  forgetSubscriptionId,
  isIosBrowserNotInstalled,
  rememberSubscriptionId,
  storedSubscriptionId,
  urlBase64ToBytes,
} from '../push-client';

async function browserSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistration) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Owns the push state of this browser, so the header button and the notifications page agree.
 * The permission prompt runs only when enable() is called. "On" is whatever the browser currently
 * has subscribed, not a value remembered in localStorage.
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PushState>('loading');
  const save = useSavePushSubscription();
  const remove = useDeletePushSubscription();

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

  const control = useMemo<PushControl>(() => {
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

    return {
      state,
      busy: save.isPending || remove.isPending,
      error: save.error ?? remove.error,
      enable,
      disable,
    };
  }, [state, save, remove]);

  return <PushContext.Provider value={control}>{children}</PushContext.Provider>;
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
