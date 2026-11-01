/** The id returned by POST /push-subscriptions, so disable can DELETE it. The on/off state does not use this. */
const STORAGE_KEY = 'kidzzy.pushSubscriptionId';

export function storedSubscriptionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberSubscriptionId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function forgetSubscriptionId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** iPhone Safari shows web push only after the app is added to the Home Screen (iOS 16.4+). */
export function isIosBrowserNotInstalled(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** VAPID public key (base64url) into the bytes pushManager.subscribe expects. */
export function urlBase64ToBytes(base64url: string): Uint8Array {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
